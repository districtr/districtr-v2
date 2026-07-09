#!/usr/bin/env bash
# Provision the ephemeral stress-test runner: one EC2 instance in a prod
# public subnet, its own egress-only security group, and an instance profile
# with SSM core + S3 write to the stress-test/ results prefix + ECS read
# (the /metrics scrape loop resolves backend task IPs). No SSH keys — access
# is SSM Session Manager only. Re-runnable; reuses SG/IAM if they exist.
#
# Run by a human with prod AWS credentials:
#   RESULTS_BUCKET=<backend bucket> REPO_SHA=<pinned commit> ./provision.sh
#
# Teardown: ./teardown.sh (same directory).
set -euo pipefail

REGION="${REGION:-us-east-2}"
STACK_PREFIX="${STACK_PREFIX:-districtr-prod}"
NAME="${NAME:-${STACK_PREFIX}-stress-runner}"
INSTANCE_TYPE="${INSTANCE_TYPE:-c7i.4xlarge}"
REPO_URL="${REPO_URL:-https://github.com/districtr/districtr-v2.git}"
REPO_SHA="${REPO_SHA:?Set REPO_SHA to the pinned commit containing backend/stress_test}"
# Backend S3 bucket (pulumi config s3BucketName / task env R2_BUCKET_NAME);
# artifacts live under stress-test/.
RESULTS_BUCKET="${RESULTS_BUCKET:?Set RESULTS_BUCKET to the backend S3 bucket name}"

export AWS_DEFAULT_REGION="$REGION"

# --- Discover prod network by the Pulumi stack's Name tags (infra/network.ts)
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=${STACK_PREFIX}-vpc" \
  --query 'Vpcs[0].VpcId' --output text)
[ "$VPC_ID" != "None" ] || { echo "VPC ${STACK_PREFIX}-vpc not found" >&2; exit 1; }
SUBNET_ID=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:Name,Values=${STACK_PREFIX}-public-0" \
  --query 'Subnets[0].SubnetId' --output text)
[ "$SUBNET_ID" != "None" ] || { echo "Subnet ${STACK_PREFIX}-public-0 not found" >&2; exit 1; }
BACKEND_SG=$(aws ec2 describe-security-groups \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:Name,Values=${STACK_PREFIX}-backend-sg" \
  --query 'SecurityGroups[0].GroupId' --output text)
echo "VPC $VPC_ID, subnet $SUBNET_ID, backend SG $BACKEND_SG"

# --- Runner security group: no ingress (SSM only), default allow-all egress
RUNNER_SG=$(aws ec2 describe-security-groups \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=group-name,Values=$NAME" \
  --query 'SecurityGroups[0].GroupId' --output text)
if [ "$RUNNER_SG" = "None" ]; then
  RUNNER_SG=$(aws ec2 create-security-group --group-name "$NAME" --vpc-id "$VPC_ID" \
    --description "Ephemeral stress-test runner: egress only, SSM access" \
    --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=$NAME},{Key=stress-test,Value=true}]" \
    --query GroupId --output text)
  echo "Created runner SG $RUNNER_SG"
else
  echo "Runner SG $RUNNER_SG already exists"
fi

# --- Instance role/profile: SSM core + scoped S3 + ECS read
IAM_CREATED=false
if ! aws iam get-role --role-name "$NAME" >/dev/null 2>&1; then
  aws iam create-role --role-name "$NAME" --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{"Effect": "Allow", "Principal": {"Service": "ec2.amazonaws.com"},
                   "Action": "sts:AssumeRole"}]
  }' >/dev/null
  IAM_CREATED=true
  echo "Created role $NAME"
fi
aws iam attach-role-policy --role-name "$NAME" \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam put-role-policy --role-name "$NAME" --policy-name stress-test-runner \
  --policy-document "$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::${RESULTS_BUCKET}/stress-test/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::${RESULTS_BUCKET}",
      "Condition": {"StringLike": {"s3:prefix": "stress-test/*"}}
    },
    {
      "Effect": "Allow",
      "Action": ["ecs:ListTasks", "ecs:DescribeTasks"],
      "Resource": "*"
    }
  ]
}
EOF
)"
if ! aws iam get-instance-profile --instance-profile-name "$NAME" >/dev/null 2>&1; then
  aws iam create-instance-profile --instance-profile-name "$NAME" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name "$NAME" --role-name "$NAME"
  IAM_CREATED=true
fi
if [ "$IAM_CREATED" = true ]; then
  echo "Waiting for IAM propagation..."
  sleep 15
fi

# --- User data: clone at the pinned SHA, install the harness venv
USERDATA=$(mktemp)
trap 'rm -f "$USERDATA"' EXIT
cat > "$USERDATA" <<EOF
#!/bin/bash
set -euxo pipefail
exec > /var/log/stress-runner-bootstrap.log 2>&1
dnf install -y git python3.12 python3.12-pip
cd /home/ec2-user
git init districtr-v2
cd districtr-v2
git remote add origin ${REPO_URL}
git fetch --depth 1 origin ${REPO_SHA}
git checkout FETCH_HEAD
python3.12 -m venv backend/stress_test/venv
backend/stress_test/venv/bin/pip install -r backend/stress_test/requirements.txt
chown -R ec2-user:ec2-user /home/ec2-user/districtr-v2
touch /home/ec2-user/bootstrap-done
# Backstop for a forgotten teardown.sh — an idle c7i.4xlarge costs ~\$17/day.
# Halt becomes terminate via the launch flag; SG/IAM/8080 rule still need
# teardown.sh.
shutdown -h +720 "stress-runner 12h self-destruct — cancel with shutdown -c"
EOF

# --- Launch (AL2023, no key pair, public IP for egress — the stack has no NAT)
AMI=$(aws ssm get-parameter \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query Parameter.Value --output text)
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$AMI" --instance-type "$INSTANCE_TYPE" \
  --subnet-id "$SUBNET_ID" --security-group-ids "$RUNNER_SG" \
  --associate-public-ip-address \
  --iam-instance-profile "Name=$NAME" \
  --instance-initiated-shutdown-behavior terminate \
  --metadata-options HttpTokens=required \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":20,"VolumeType":"gp3"}}]' \
  --user-data "file://$USERDATA" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME},{Key=stress-test,Value=true}]" \
  --query 'Instances[0].InstanceId' --output text)
echo "Launched $INSTANCE_ID; waiting for running state..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"

cat <<EOF

Runner provisioned.
  INSTANCE_ID=$INSTANCE_ID
  RUNNER_SG=$RUNNER_SG
  BACKEND_SG=$BACKEND_SG

Bootstrap takes ~2 min (done when /home/ec2-user/bootstrap-done exists;
log: /var/log/stress-runner-bootstrap.log).

The instance self-terminates 12h after boot as a cost backstop (cancel on
the box with: sudo shutdown -c). Run ./teardown.sh anyway — the SG, IAM
role/profile, and temp 8080 rule outlive the instance.

Next steps (see backend/stress_test/README.md "Runner"):
  # temp SG rule so the runner can scrape /metrics (revoke in teardown.sh):
  aws ec2 authorize-security-group-ingress --region $REGION \\
    --group-id $BACKEND_SG --protocol tcp --port 8080 --source-group $RUNNER_SG
  # shell on the runner:
  aws ssm start-session --region $REGION --target $INSTANCE_ID
EOF
