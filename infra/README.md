# Districtr v2 AWS Infrastructure

Pulumi (TypeScript) project managing the AWS deployment: ECS Fargate services
behind an ALB, RDS PostgreSQL + PostGIS, ECR, SSM secrets, and CloudWatch
alarms. Two stacks: `dev` (deployed from the `dev` branch) and `prod`
(deployed from `main`). State lives in an S3 bucket; config secrets are
encrypted with a KMS key — there is no Pulumi Cloud dependency.

Out of scope (untouched by this project): the existing S3 tileset bucket and
CloudFront CDN, Auth0, Sentry, DNS hosting, the data pipelines, and the CMS.

## Architecture

```
DNS (external) ──► ALB ──host: api.*──► ECS backend (FastAPI, 8080)
                    │                        │
                    └──default──► ECS        └──► RDS PostgreSQL + PostGIS
                                  frontend            (private, SG-locked)
                                  (Next.js, 3000)
Browser ──────────► existing CloudFront/S3 (tiles, parquet, thumbnails)
Backend ──task role + S3 gateway endpoint──► existing S3 bucket
```

- Tasks run in public subnets with strict security groups (no NAT cost);
  only the ALB can reach them.
- Graph pickles are streamed from S3 per cache miss (free in-region via the
  S3 gateway endpoint) and held in the backend's in-process LRU.
- Alembic migrations run as a one-off `districtr-{env}-migrate` task before
  each service rollout (see `.github/workflows/deploy-api.yml`).
- Image tags: deploy workflows push `:{git sha}` to ECR and write the SHA to
  `/districtr/{stack}/meta/{backend,frontend}-image-tag` in SSM, then run
  `pulumi up`. Set the `backendImageTag`/`frontendImageTag` config values to
  pin/rollback manually (config overrides SSM).

## One-time bootstrap

1. With admin credentials:
   ```bash
   GITHUB_REPO=<org>/districtr-v2 ./scripts/bootstrap.sh
   ```
   Creates: S3 state bucket, KMS key `alias/districtr-pulumi-secrets`,
   GitHub OIDC provider, deploy role `districtr-gha-deploy`
   (AdministratorAccess initially — scoping down is a follow-up), and seed
   SSM image-tag parameters.
2. Set the GitHub Actions **repository variable** `AWS_DEPLOY_ROLE_ARN` to
   the role ARN the script prints. Keep existing secrets
   `SENTRY_AUTH_TOKEN`, `RECAPTCHA_SITE_KEY`, `NEXT_PUBLIC_MAPTILER_API_KEY`;
   add **variables** `API_URL_DEV` / `API_URL_PROD` (the public API URLs,
   e.g. `https://api.dev.districtr.org`). Optional variable: `AWS_REGION`
   (defaults to `us-east-2` in the workflows; it must match the region the
   state bucket and stacks were bootstrapped in — it is a sync knob, not a
   region switch).
3. Initialize stacks:
   ```bash
   pulumi login 's3://districtr-v2-pulumi-state?region=us-east-2'
   cd infra && npm ci
   pulumi stack init dev --secrets-provider='awskms://alias/districtr-pulumi-secrets?region=us-east-2'
   pulumi stack init prod --secrets-provider='awskms://alias/districtr-pulumi-secrets?region=us-east-2'
   ```
4. Fill in the `TODO(fill-in)` values in `Pulumi.dev.yaml` / `Pulumi.prod.yaml`
   (real values come from Fly: `flyctl ssh console -C env -a <app>`, NOT from
   fly.toml `[env]`, which is stale) and set the secrets per stack:
   ```bash
   pulumi stack select dev
   pulumi config set --secret secretKey "$(openssl rand -hex 32)"
   pulumi config set --secret auth0ClientId ...
   pulumi config set --secret auth0ClientSecret ...
   pulumi config set --secret auth0SessionSecret "$(openssl rand -hex 32)"
   pulumi config set --secret openaiApiKey ...        # optional
   pulumi config set --secret recaptchaSecretKey ...  # optional
   ```
   The encrypted values are written into the stack YAML — commit them.
5. First `pulumi up`: the run pauses at ACM validation. Create the DNS
   records shown in the `dnsRecords` stack output (ACM validation CNAMEs)
   at the DNS provider, and the up completes. Services will crash-loop on
   the seed `bootstrap` image tag until the first deploy workflow runs —
   harmless while DNS still points at Fly.
6. Push to `dev` (or run the deploy workflows manually) to build images,
   run migrations, and roll the services. Then create the app/api DNS
   records from `dnsRecords` when ready to cut over. Apex domains
   (`districtr.org`) need ALIAS/CNAME-flattening support at the provider.

## Fresh AWS account / cross-account bucket access

This project can run in a fresh AWS account (same org) while the tileset
bucket and CloudFront stay in the old account — no data migration needed.
Browser traffic goes through CloudFront and is unaffected; only the
backend's boto3 access (graph reads, thumbnail writes, county CSV) crosses
accounts. Cross-account S3 needs an allow on both sides: the task role in
`backend.ts` is the identity-side half (bucket ARNs aren't
account-qualified), and the old account needs this bucket policy (one-time,
manual — the bucket is not managed here):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DistrictrNewAccountBackend",
    "Effect": "Allow",
    "Principal": {"AWS": "arn:aws:iam::<NEW_ACCOUNT_ID>:root"},
    "Action": ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
    "Resource": [
      "arn:aws:s3:::<bucket-name>",
      "arn:aws:s3:::<bucket-name>/*"
    ]
  }]
}
```

(Granting account root delegates the which-roles decision to this account's
IAM. Alternative: `"Principal": "*"` with a
`"Condition": {"StringEquals": {"aws:PrincipalOrgID": "o-xxxx"}}` to cover
every account in the org.)

Check on the old bucket before relying on this:

- **Object Ownership** must be "Bucket owner enforced" so thumbnails written
  by this account's role are owned by the bucket owner and CloudFront can
  serve them. Older buckets may still have ACLs enabled — flip it first.
- **Encryption**: SSE-S3 needs nothing extra; SSE-KMS with a customer-managed
  key additionally needs `kms:Decrypt`/`kms:GenerateDataKey` for this account
  in the key policy.
- **Region**: the free S3 gateway endpoint only reaches buckets in the same
  region as the VPC. If the bucket is not in this stack's region, reads still
  work but pay cross-region transfer (~$0.02/GB) — prefer matching the
  stack's region to the bucket.

## Day-to-day

- `infra.yml` applies on push to `dev`/`main`. There is deliberately no PR
  preview: a preview executes the PR's code, which must not hold the (admin)
  deploy role. Preview locally before merging:
  ```bash
  pulumi login 's3://districtr-v2-pulumi-state?region=us-east-2'
  cd infra && pulumi stack select dev
  pulumi preview
  pulumi stack output dnsRecords
  ```
- `deploy-api.yml` / `deploy-app.yml` replace the Fly deploy workflows
  (which remain until decommission): build → ECR → (migrate) → `pulumi up` →
  verify the service stabilized on the new image (a circuit-breaker rollback
  fails the run). Both support manual `workflow_dispatch` runs.
- The three workflows use per-workflow concurrency groups and retry
  `pulumi up` on state-lock contention; a push touching backend + app +
  infra at once runs all three and they serialize via the lock.

## Follow-ups (known, deliberate deferrals)

- Scope the deploy role down from AdministratorAccess.
- Pin GitHub Actions to commit SHAs and pin the Pulumi CLI version.
- ALB access logs + WAF; RDS parameter tuning (`work_mem` etc.) and
  `enabledCloudwatchLogsExports`; ECS Exec on dev for a `fly ssh` equivalent.
- Lifecycle policy for noncurrent versions on the Pulumi state bucket.
- ECR keeps the last 20 images — a long-pinned rollback tag can expire.

## Data migration (Fly Postgres → RDS)

Temporarily expose RDS, restore, then lock it back down:

```bash
pulumi config set dbPubliclyAccessible true
pulumi config set operatorCidr <your-ip>/32
pulumi up --yes

fly proxy 15432:5432 -a <fly-postgres-app> &
pg_dump -Fc --no-owner --no-acl -h localhost -p 15432 -U postgres districtr > districtr.dump
psql "host=$(pulumi stack output dbAddress) user=districtr dbname=districtr" \
  -c 'CREATE EXTENSION IF NOT EXISTS postgis;'
pg_restore --no-owner -j4 -h "$(pulumi stack output dbAddress)" \
  -U districtr -d districtr districtr.dump

pulumi config rm dbPubliclyAccessible && pulumi config rm operatorCidr
pulumi up --yes
```

The RDS PostGIS version must be >= the Fly Postgres one — check with
`SELECT postgis_full_version();` on both, and pin `dbEngineVersion` if
needed. The DB password is generated by Pulumi:
`pulumi stack output --show-secrets` exposes it via the DATABASE_URL SSM
parameter if needed for manual access.

## Cost levers

Dev ≈ $135–150/mo, prod ≈ $490–510/mo at default sizing. To trim dev:
Fargate Spot capacity provider, scheduled scale-to-zero off-hours, or
smaller `backendMemory` if the graph LRU allows. A Compute Savings Plan
helps prod once sizing settles.
