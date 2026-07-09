# Stress-test run protocol (operator runbook)

Operator checklist for the production stress-test run.
Commands are documented in full in `README.md` (harness, seed/cleanup, runner)
and `infra/athena/OBSERVABILITY.md` (dashboard, Athena, SG rule, alarms).
Region is `us-east-2` throughout. Pick a `RUN_ID` (e.g. `run1`) and use it
everywhere below.

## 1. Pre-flight (day of run, before provisioning)

- [ ] **Notify alarm recipients** (`alarmEmails` in `Pulumi.prod.yaml`:
      dhalpern@, gfang@, peter@) of the run window. Likely to fire:
      `districtr-prod-backend-memory-high` (ECS mem >85%) and
      `districtr-prod-db-cpu-high` (RDS CPU >80%); each also sends an OK
      email when it clears. Table in `infra/athena/OBSERVABILITY.md`.
- [ ] **Sentry quota**: `traces_sample_rate=1.0` is hard-coded in
      `backend/app/main.py:110` (not an env var). Expected load ≈ 35 rps ×
      900 s ≈ 30k transactions + profiles. Check remaining Sentry quota; if
      tight, lowering the rate is a **code change + deploy**, not a config
      flip — decide before the run.
- [ ] **RDS snapshot**: confirm a recent automated snapshot exists
      (`aws rds describe-db-snapshots --db-instance-identifier <prod-db> --query 'DBSnapshots[-1].SnapshotCreateTime'`).
- [ ] **Deploy observability** (deferred until run day): `cd infra && pulumi preview --stack prod`
      — expect 4 creates (logs bucket + lifecycle + policy, dashboard) and 1
      in-place ALB update — then `pulumi up`. ALB access logs must be live
      before the dry run so Athena has data. Note the `albLogsBucket` output;
      one-time Athena table setup per `infra/athena/OBSERVABILITY.md`.
- [ ] **CDN config live**: `curl -sf https://tilesets1.cdn.districtr.org/stress-test/config.json`
      returns the stress-test config JSON (was 403 during build).
- [ ] **Code pushed**: all `backend/stress_test/` + `infra/` work committed and
      pushed to `github.com/districtr/districtr-v2`; `REPO_SHA=$(git rev-parse origin/main)`
      is what the runner bootstraps from.
- [ ] **Eval lock fix live in prod**: the per-document `/evaluation` compute
      lock must be merged to main **and deployed to the prod backend** before
      the run — merged-but-undeployed reintroduces the cache-cold 500 burst
      the abort criteria no longer excuse.
- [ ] **Provision runner**: `cd backend/stress_test/runner && RESULTS_BUCKET=<backend bucket> REPO_SHA=<sha> ./provision.sh`
      (bucket = Pulumi `s3BucketName` / task env `R2_BUCKET_NAME`). Wait for
      `/home/ec2-user/bootstrap-done`, then run the printed
      `authorize-security-group-ingress` one-liner (temp 8080 rule for
      `/metrics` scrapes).
- [ ] **Seed** via ECS Exec (README "Prod" section):
      `python cli.py stress-test-seed --run-id $RUN_ID --base-url http://localhost:8080 --manifest s3://$R2_BUCKET_NAME/stress-test/stress_test_manifest_$RUN_ID.json`.
      Aborts before creating anything if a config slug is missing from prod.
- [ ] **`SCALE=0.01` dry run green, same day** (deferred acceptance check):
      seed a throwaway `RUN_ID=dry1`, then
      `aws ssm send-command ... 'commands=["env RESULTS_BUCKET=<bucket> RUN_ID=dry1 SCALE=0.01 /home/ec2-user/districtr-v2/backend/stress_test/runner/run.sh > /home/ec2-user/dry1.log 2>&1"],executionTimeout=["5400"]'`
      (~127 users, ~18 min). Verify `aws s3 ls s3://<bucket>/stress-test/dry1/`
      shows CSVs, HTML, `locust.log`, `metrics/*.prom` (empty metrics/ = 8080
      rule not authorized), cache snapshots, both manifests. Then delete the
      dry-run docs with the cleanup one-liner (step 5) using the `dry1`
      manifests. Known non-fatal: locust exits 1 if *any* request failed
      (create 504s are known) — judge by the S3 artifacts.

## 2. Baseline (15 min idle)

- [ ] Open CloudWatch dashboard **`districtr-prod-stress-test`** and let it
      sit ≥15 min with no test traffic. Note idle values: ECS CPU/mem, running
      task count (expect 2), ALB RequestCount + p50/p95/p99, RDS CPU +
      DatabaseConnections. Screenshot for the results report.

## 3. The run (`SCALE=1.0`)

- [ ] Trigger (detached; survives dropped SSM session):
      `aws ssm send-command --region us-east-2 --instance-ids $INSTANCE_ID --document-name AWS-RunShellScript --parameters 'commands=["env RESULTS_BUCKET=<bucket> RUN_ID=run1 SCALE=1.0 /home/ec2-user/districtr-v2/backend/stress_test/runner/run.sh > /home/ec2-user/run1.log 2>&1"],executionTimeout=["5400"]'`
      — 12,750 users over a 900 s window + 180 s tail (~18 min).
- [ ] Tail progress: `aws ssm start-session --target $INSTANCE_ID`, then
      `tail -f /home/ec2-user/run1.log`. Also watch runner CPU (`top`) — if the
      single locust process pins a core, note it for the results report
      (`--processes 4` next time).
- [ ] Watch on the dashboard:
  - **Task count**: expect autoscale 2→N once CPU passes 45% (60 s cooldown).
  - **DatabaseConnections** vs the ~15/task ceiling (pool 5 + overflow 10);
    a plateau at 15×tasks with rising latency = pool exhaustion.
  - **ALB 5xx** (target + ELB) and TargetResponseTime p95/p99.
  - Known suspects: occasional `create_document` 504s at the 15 s
    lock_timeout. Cache-cold `/evaluation` 500 bursts were fixed by the
    per-document compute lock — with the fix deployed, any eval-500 burst is
    a **finding**, not expected noise.

## 4. Abort criteria

Abort if any of: **sustained target 5xx** (alarm `alb-target-5xx`, >25/5 min),
**RDS CPU pinned >90%**, **unhealthy backend targets**, or **real-user
complaints**. Abort switch (graceful — the
harness flushes the runtime manifest and run.sh still uploads all artifacts):

```sh
aws ssm send-command --region us-east-2 --instance-ids $INSTANCE_ID \
    --document-name AWS-RunShellScript \
    --parameters 'commands=["pkill -TERM -f locust"]'
```

Even after an abort, do all of step 5.

## 5. Post-run

- [ ] **Artifacts**: run.sh prints `Artifacts: s3://<bucket>/stress-test/run1/`
      — confirm CSVs, HTML, `locust.log`, `metrics/`, cache before/after, both
      manifests are there.
- [ ] **Cleanup** (ECS Exec, README "Prod" section):
      `python cli.py stress-test-cleanup -m s3://$R2_BUCKET_NAME/stress-test/stress_test_manifest_run1.json -m s3://$R2_BUCKET_NAME/stress-test/stress_test_runtime_manifest_run1.json --yes`
      (`--yes` also sweeps any leftover `[STRESS-TEST]`-named docs).
- [ ] **Verify counts**: cleanup output reports deletions and lists 0
      remaining `[STRESS-TEST]` documents; spot-check one seed id —
      `GET /api/document/<seed document_id>` → 404.
- [ ] **Revoke the temp 8080 SG rule + teardown**: `./teardown.sh` (runner
      dir) revokes the rule, terminates the instance, deletes the runner SG
      and IAM role/profile.
- [ ] **Snapshot the dashboard** (run window + the idle baseline) and pull
      Athena results (`infra/athena/*.sql`; logs deliver in ~5 min batches).
      Hand everything to the results write-up.
- [ ] Confirm any alarms that fired have cleared (OK emails received).
