#!/usr/bin/env bash
# One-time AWS bootstrap for the Pulumi project: state bucket, KMS secrets
# key, GitHub OIDC provider + deploy role, and the SSM image-tag seeds.
# Run by a human with admin credentials; everything else lives in Pulumi.
#
# Usage:
#   GITHUB_REPO=<org>/districtr-v2 ./bootstrap.sh
set -euo pipefail

REGION="${REGION:-us-east-1}"
STATE_BUCKET="${STATE_BUCKET:-districtr-v2-pulumi-state}"
KMS_ALIAS="${KMS_ALIAS:-alias/districtr-pulumi-secrets}"
ROLE_NAME="${ROLE_NAME:-districtr-gha-deploy}"
GITHUB_REPO="${GITHUB_REPO:?Set GITHUB_REPO, e.g. GITHUB_REPO=districtr/districtr-v2}"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Bootstrapping account ${ACCOUNT_ID} in ${REGION} for repo ${GITHUB_REPO}"

# 1. Pulumi state bucket
if aws s3api head-bucket --bucket "$STATE_BUCKET" 2>/dev/null; then
  echo "State bucket ${STATE_BUCKET} already exists"
else
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$STATE_BUCKET" --region "$REGION"
  else
    aws s3api create-bucket --bucket "$STATE_BUCKET" --region "$REGION" \
      --create-bucket-configuration "LocationConstraint=$REGION"
  fi
  echo "Created state bucket ${STATE_BUCKET}"
fi
aws s3api put-bucket-versioning --bucket "$STATE_BUCKET" \
  --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$STATE_BUCKET" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-public-access-block --bucket "$STATE_BUCKET" \
  --public-access-block-configuration 'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'

# 2. KMS key for Pulumi config secrets
if aws kms describe-key --key-id "$KMS_ALIAS" >/dev/null 2>&1; then
  echo "KMS alias ${KMS_ALIAS} already exists"
else
  KEY_ID=$(aws kms create-key --description "Pulumi config secrets for districtr-v2" \
    --query KeyMetadata.KeyId --output text)
  aws kms create-alias --alias-name "$KMS_ALIAS" --target-key-id "$KEY_ID"
  echo "Created KMS key ${KEY_ID} (${KMS_ALIAS})"
fi

# 3. GitHub OIDC provider
OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" >/dev/null 2>&1; then
  echo "GitHub OIDC provider already exists"
else
  aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 1c58a3a8518e8759bf075b76b750d4f2df264fcd
  echo "Created GitHub OIDC provider"
fi

# 4. Deploy role assumable from dev/main pushes and PR preview runs.
#    AdministratorAccess to start with; scoping down is a listed follow-up.
TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {"Federated": "${OIDC_ARN}"},
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {"token.actions.githubusercontent.com:aud": "sts.amazonaws.com"},
        "StringLike": {
          "token.actions.githubusercontent.com:sub": [
            "repo:${GITHUB_REPO}:ref:refs/heads/main",
            "repo:${GITHUB_REPO}:ref:refs/heads/dev",
            "repo:${GITHUB_REPO}:pull_request"
          ]
        }
      }
    }
  ]
}
EOF
)
if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "Role ${ROLE_NAME} already exists; updating trust policy"
  aws iam update-assume-role-policy --role-name "$ROLE_NAME" --policy-document "$TRUST_POLICY"
else
  aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document "$TRUST_POLICY"
  echo "Created role ${ROLE_NAME}"
fi
aws iam attach-role-policy --role-name "$ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess

# 5. Seed image-tag parameters (deploy workflows overwrite these with git SHAs)
for STACK in dev prod; do
  for COMPONENT in backend frontend; do
    PARAM="/districtr/${STACK}/meta/${COMPONENT}-image-tag"
    if aws ssm get-parameter --name "$PARAM" --region "$REGION" >/dev/null 2>&1; then
      echo "SSM parameter ${PARAM} already exists"
    else
      aws ssm put-parameter --name "$PARAM" --type String --value bootstrap --region "$REGION"
      echo "Seeded ${PARAM}=bootstrap"
    fi
  done
done

cat <<EOF

Bootstrap complete.

Next steps:
  1. pulumi login 's3://${STATE_BUCKET}?region=${REGION}'
  2. cd infra && npm ci
  3. pulumi stack init dev --secrets-provider='awskms://${KMS_ALIAS}?region=${REGION}'
     (and the same for prod)
  4. Fill in Pulumi.dev.yaml / Pulumi.prod.yaml and set secrets (see README.md)
  5. Set GitHub repo variable AWS_DEPLOY_ROLE_ARN=arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}
EOF
