# Stress-test run protocol (operator runbook)

Self-contained checklist for production stress-test runs. No README round-trips.
Region is `us-east-2` throughout.

---

## 0. Variables

Set once; every later block uses these names.

```sh
export AWS_DEFAULT_REGION=us-east-2
export CLUSTER=districtr-prod

# Pulumi state lives in S3 — log in before any pulumi command
pulumi login 's3://districtr-v2-pulumi-state?region=us-east-2'

export BUCKET=$(cd infra && pulumi config get s3BucketName --stack prod)
export RUN_ID=run1
export INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=districtr-prod-stress-runner" \
            "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].InstanceId' --output text)
```

---

## 1. Pre-flight (day of run, before provisioning)

- [ ] **Provision runner**:
  ```sh
  cd backend/stress_test/runner
  RESULTS_BUCKET=$BUCKET REPO_SHA=$REPO_SHA ./provision.sh
  # Wait for: /home/ec2-user/bootstrap-done
  # Then run the printed authorize-security-group-ingress one-liner (temp 8080 rule)
  export INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=districtr-prod-stress-runner" \
              "Name=instance-state-name,Values=running" \
    --query 'Reservations[].Instances[].InstanceId' --output text)
  ```
- [ ] **Seed** (ECS Exec into backend task):
  ```sh
  TASK_ARN=$(aws ecs list-tasks --cluster $CLUSTER --service-name backend \
    --query 'taskArns[0]' --output text)
  aws ecs execute-command --cluster $CLUSTER --task $TASK_ARN \
    --container backend --interactive --command \
    "python cli.py stress-test-seed --run-id $RUN_ID --base-url http://localhost:8080 \
    --manifest s3://$BUCKET/stress-test/stress_test_manifest_${RUN_ID}.json"
  ```
  Aborts before creating anything if a config slug is missing from prod.
- [ ] **`SCALE=0.01` dry run green, same day** (deferred acceptance check):
  ```sh
  aws ssm send-command --region $AWS_DEFAULT_REGION \
    --instance-ids $INSTANCE_ID \
    --document-name AWS-RunShellScript \
    --parameters "commands=[\"env RESULTS_BUCKET=$BUCKET RUN_ID=dry1 SCALE=0.01 \
    /home/ec2-user/districtr-v2/backend/stress_test/runner/run.sh \
    > /home/ec2-user/dry1.log 2>&1\"],executionTimeout=[\"5400\"]"
  ```
  Verify: `aws s3 ls s3://$BUCKET/stress-test/dry1/` — expect CSVs, HTML,
  `locust.log`, `metrics/*.prom` (empty metrics/ = 8080 rule not authorized),
  cache snapshots, both manifests. Then cleanup:
  ```sh
  aws ecs execute-command --cluster $CLUSTER --task $TASK_ARN \
    --container backend --interactive --command \
    "python cli.py stress-test-cleanup \
    -m s3://$BUCKET/stress-test/stress_test_manifest_dry1.json \
    -m s3://$BUCKET/stress-test/stress_test_runtime_manifest_dry1.json --yes"
  ```
  Known non-fatal: locust exits 1 if any request failed (create 504s are expected).

---

## 2. The run (`SCALE=1.0`)

Trigger (detached; survives dropped SSM session):
```sh
CMD_ID=$(aws ssm send-command --region $AWS_DEFAULT_REGION \
  --instance-ids $INSTANCE_ID \
  --document-name AWS-RunShellScript \
  --parameters "commands=[\"env RESULTS_BUCKET=$BUCKET RUN_ID=$RUN_ID SCALE=1.0 \
  /home/ec2-user/districtr-v2/backend/stress_test/runner/run.sh \
  > /home/ec2-user/${RUN_ID}.log 2>&1\"],executionTimeout=[\"5400\"]" \
  --query 'Command.CommandId' --output text)
echo "CMD_ID=$CMD_ID"
```

Check command status:
```sh
aws ssm get-command-invocation --command-id $CMD_ID --instance-id $INSTANCE_ID \
  --query '[Status, StatusDetails]' --output text
# InProgress → Success (or Failed on abort)
```

Tail the log (two options):
```sh
# Option A: SSM session on the runner
aws ssm start-session --target $INSTANCE_ID
sudo tail -f /home/ec2-user/${RUN_ID}.log

# Option B: one-shot from your laptop
aws ssm send-command --region $AWS_DEFAULT_REGION \
  --instance-ids $INSTANCE_ID --document-name AWS-RunShellScript \
  --parameters "commands=[\"tail -100 /home/ec2-user/${RUN_ID}.log\"]" \
  --query 'Command.CommandId' --output text
# then get-command-invocation StandardOutputContent for that ID
```

Watch on the dashboard:
- **Task count**: expect autoscale 2→N once CPU passes 45% (60 s cooldown; ~8 min lag).
- **DatabaseConnections** vs ~15/task ceiling (pool 5 + overflow 10); plateau + rising
  latency = pool exhaustion. Alarm fires at 700.
- **ALB TargetResponseTime p95** — alarm fires at >5 s. Every full run has hit the 120 s wall.
- **RDS CPUCreditBalance** — alarm fires at <100 credits; 0 = sustained 100% CPU on burstable instance.
- **ALB 5xx** (target + ELB) and p99.
- Known noise: `create_document` 504s at the 15 s lock_timeout. Cache-cold `/evaluation`
  500 bursts were fixed; any eval-500 burst post-fix is a **finding**.

---

## 4. Abort criteria

Abort if any: **sustained target 5xx** (alarm `alb-target-5xx` >25/5 min), **RDS CPU
pinned >90%**, **unhealthy backend targets**, **real-user complaints**.

Graceful abort (harness flushes runtime manifest; run.sh still uploads all artifacts):
```sh
aws ssm send-command --region $AWS_DEFAULT_REGION \
  --instance-ids $INSTANCE_ID \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["pkill -TERM -f locust"]'
```

Even after an abort, do step 6.

---

## 5. Post-run

- [ ] **Artifacts**: `aws s3 ls s3://$BUCKET/stress-test/$RUN_ID/` — expect CSVs,
      HTML, `locust.log`, `metrics/`, cache before/after, both manifests.
- [ ] **Cleanup** (ECS Exec):
  ```sh
  aws ecs execute-command --cluster $CLUSTER --task $TASK_ARN \
    --container backend --interactive --command \
    "python cli.py stress-test-cleanup \
    -m s3://$BUCKET/stress-test/stress_test_manifest_${RUN_ID}.json \
    -m s3://$BUCKET/stress-test/stress_test_runtime_manifest_${RUN_ID}.json --yes"
  ```
  `--yes` also sweeps any leftover `[STRESS-TEST]`-named docs.
- [ ] **Verify counts**: cleanup output reports deletions; 0 remaining `[STRESS-TEST]`
      docs. Spot-check: `GET /api/document/<seed_doc_id>` → 404.
- [ ] **Revoke 8080 rule + teardown**:
  ```sh
  cd backend/stress_test/runner && ./teardown.sh
  ```
  Revokes the temp SG rule, terminates the instance, deletes runner SG and IAM role/profile.
- [ ] **Snapshot the dashboard** (run window + idle baseline) and pull Athena results
      (`infra/athena/*.sql`; logs batch in ~5 min).
- [ ] **Confirm alarms cleared** (OK emails for: latency, connections, credit balance, CPU).

---

## Per-class runs

`USER_CLASSES` selects a single locust class; `-u` is still the full TOTAL across
all classes. Use a proportional scale so the user count matches what that class
gets in a full mixed run (VIEWERS=10k, EVAL_USERS=2.5k, EDITORS=250 → total 12.75k).

**Viewers only** (`SCALE=0.8` → ~10k users, all Viewers):
```sh
CMD_ID=$(aws ssm send-command --region $AWS_DEFAULT_REGION \
  --instance-ids $INSTANCE_ID --document-name AWS-RunShellScript \
  --parameters "commands=[\"env RESULTS_BUCKET=$BUCKET RUN_ID=viewers1 SCALE=0.8 \
  USER_CLASSES=Viewer \
  /home/ec2-user/districtr-v2/backend/stress_test/runner/run.sh \
  > /home/ec2-user/viewers1.log 2>&1\"],executionTimeout=[\"5400\"]" \
  --query 'Command.CommandId' --output text)
```

**Evaluators only** (`SCALE=0.2` → ~2.5k users, all EvalUsers):
```sh
CMD_ID=$(aws ssm send-command --region $AWS_DEFAULT_REGION \
  --instance-ids $INSTANCE_ID --document-name AWS-RunShellScript \
  --parameters "commands=[\"env RESULTS_BUCKET=$BUCKET RUN_ID=eval1 SCALE=0.2 \
  USER_CLASSES=EvalUser \
  /home/ec2-user/districtr-v2/backend/stress_test/runner/run.sh \
  > /home/ec2-user/eval1.log 2>&1\"],executionTimeout=[\"5400\"]" \
  --query 'Command.CommandId' --output text)
```

**Editors only** (`SCALE=0.02` → ~250 users, all Editors):
```sh
CMD_ID=$(aws ssm send-command --region $AWS_DEFAULT_REGION \
  --instance-ids $INSTANCE_ID --document-name AWS-RunShellScript \
  --parameters "commands=[\"env RESULTS_BUCKET=$BUCKET RUN_ID=editors1 SCALE=0.02 \
  USER_CLASSES=Editor \
  /home/ec2-user/districtr-v2/backend/stress_test/runner/run.sh \
  > /home/ec2-user/editors1.log 2>&1\"],executionTimeout=[\"5400\"]" \
  --query 'Command.CommandId' --output text)
```

---

## Operational helpers

### Runner-alive check / re-provision

The runner EC2 self-terminates after 12 h. Check:
```sh
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=districtr-prod-stress-runner" \
            "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].InstanceId' --output text
# Empty = terminated; re-run provision.sh and refresh INSTANCE_ID (§2 step 8)
```

### Reading root-owned logs

SSM send-command runs as root; `sudo tail` or send-command tail both work:
```sh
# From SSM session on runner:
sudo tail -f /home/ec2-user/${RUN_ID}.log

# Or one-shot from laptop — get CommandId, then read StandardOutputContent:
aws ssm get-command-invocation --command-id $CMD_ID --instance-id $INSTANCE_ID \
  --query 'StandardOutputContent' --output text
```

---

## Failure triage

| Code / error | Likely cause | Known noise? |
|---|---|---|
| **504** | ALB idle/total timeout; capacity shortfall or slow target | `create_document` 504s at 15 s lock_timeout are **expected noise**; sustained 504s elsewhere are a **finding** |
| **502** | Target reset mid-response (OOM, task shutdown during autoscale) | Brief bursts during scale-out are noise; sustained = finding |
| **500** | App error (check Sentry + backend logs) | Pre-fix eval-500 bursts were noise; post-fix any 500 burst is a **finding** |
| `msgpack` / `Expecting value` | Truncated body — target returned partial response before timeout/reset | Parse artifact; the underlying 504/502 is the real signal |
