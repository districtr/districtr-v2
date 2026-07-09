#!/usr/bin/env bash
# Tear down everything provision.sh created: revoke the temp 8080 SG rule,
# terminate the runner instance(s), delete the runner SG and IAM
# role/instance profile. Safe to re-run. Run by a human with prod AWS creds:
#   ./teardown.sh
set -euo pipefail

REGION="${REGION:-us-east-2}"
STACK_PREFIX="${STACK_PREFIX:-districtr-prod}"
NAME="${NAME:-${STACK_PREFIX}-stress-runner}"

export AWS_DEFAULT_REGION="$REGION"

VPC_ID=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=${STACK_PREFIX}-vpc" \
  --query 'Vpcs[0].VpcId' --output text)
RUNNER_SG=$(aws ec2 describe-security-groups \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=group-name,Values=$NAME" \
  --query 'SecurityGroups[0].GroupId' --output text)
BACKEND_SG=$(aws ec2 describe-security-groups \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:Name,Values=${STACK_PREFIX}-backend-sg" \
  --query 'SecurityGroups[0].GroupId' --output text)

# 1. Revoke the temporary /metrics scrape rule (may already be absent)
if [ "$RUNNER_SG" != "None" ] && [ "$BACKEND_SG" != "None" ]; then
  aws ec2 revoke-security-group-ingress --group-id "$BACKEND_SG" \
    --protocol tcp --port 8080 --source-group "$RUNNER_SG" \
    && echo "Revoked 8080 rule on $BACKEND_SG" \
    || echo "No 8080 rule to revoke"
fi

# 2. Terminate runner instance(s)
INSTANCE_IDS=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=$NAME" \
    "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query 'Reservations[].Instances[].InstanceId' --output text)
if [ -n "$INSTANCE_IDS" ]; then
  # shellcheck disable=SC2086
  aws ec2 terminate-instances --instance-ids $INSTANCE_IDS >/dev/null
  echo "Terminating $INSTANCE_IDS (waiting)..."
  # shellcheck disable=SC2086
  aws ec2 wait instance-terminated --instance-ids $INSTANCE_IDS
else
  echo "No runner instances found"
fi

# 3. Runner SG (retry: ENI detach lags termination)
if [ "$RUNNER_SG" != "None" ]; then
  for _ in $(seq 1 12); do
    if aws ec2 delete-security-group --group-id "$RUNNER_SG" 2>/dev/null; then
      echo "Deleted SG $RUNNER_SG"
      RUNNER_SG=None
      break
    fi
    sleep 10
  done
  [ "$RUNNER_SG" = "None" ] || { echo "Could not delete SG $RUNNER_SG" >&2; exit 1; }
fi

# 4. IAM instance profile + role
if aws iam get-instance-profile --instance-profile-name "$NAME" >/dev/null 2>&1; then
  aws iam remove-role-from-instance-profile --instance-profile-name "$NAME" \
    --role-name "$NAME" 2>/dev/null || true
  aws iam delete-instance-profile --instance-profile-name "$NAME"
fi
if aws iam get-role --role-name "$NAME" >/dev/null 2>&1; then
  aws iam delete-role-policy --role-name "$NAME" --policy-name stress-test-runner 2>/dev/null || true
  aws iam detach-role-policy --role-name "$NAME" \
    --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore 2>/dev/null || true
  aws iam delete-role --role-name "$NAME"
  echo "Deleted IAM role/profile $NAME"
fi

echo "Teardown complete."
