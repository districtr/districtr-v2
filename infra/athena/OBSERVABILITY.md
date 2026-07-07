# Stress-test observability

What WS3 adds and how the operator uses it during a stress-test run
(see `STRESS_TEST_PLAN.md` §5 WS3, §7).

- **ALB access logs** (`infra/alb.ts`): S3 bucket + `accessLogs` on the ALB.
  Per-request server-side latency, queried with Athena (this directory).
- **CloudWatch dashboard** `districtr-prod-stress-test` (`infra/monitoring.ts`):
  ECS CPU/memory/task count, ALB requests/latency percentiles/5xx, RDS.
  No new alarms.
- **`/metrics` scrapes**: manual runbook below — deliberately not in Pulumi.

## Athena over ALB access logs

CloudWatch cannot give per-endpoint latency (`TargetResponseTime` is
per-target-group); the access logs can — each line carries the URL,
`target_processing_time`, and status code.

One-time setup (Athena console or CLI, region `us-east-2`):

1. `pulumi stack output albLogsBucket` (prod stack) and
   `aws sts get-caller-identity --query Account --output text`.
2. Substitute `<BUCKET>` / `<ACCOUNT_ID>` in `alb_access_logs_ddl.sql` and run
   it in Athena (any workgroup with a query-results location).
3. Run the canned queries; each filters on
   `user_agent LIKE 'districtr-stress-test/%'` so real-user traffic is
   excluded (the harness sends `User-Agent: districtr-stress-test/<run-id>`):
   - `latency_by_endpoint_per_minute.sql` — p50/p95/p99 per URL pattern per minute
   - `error_rate_by_endpoint.sql` — 4xx/5xx counts and 5xx rate per URL pattern
   - `slowest_100_requests.sql` — the 100 slowest requests with payload sizes

Logs are delivered in ~5-minute batches; wait a few minutes after the run
before expecting complete results. The bucket expires objects after
`logRetentionDays` (90 in prod).

## Prometheus `/metrics` scrapes from the runner

The backend already exposes per-endpoint Prometheus histograms at
`GET /metrics` (`backend/app/main.py:128`), blocked at the ALB by a 403 path
rule. The runner scrapes tasks directly on port 8080 instead — flat files
every 15s, no Prometheus server.

**Temporary SG rule** (backend SG normally admits 8080 from the ALB SG only).
This is a documented manual pair, intentionally not wired into Pulumi:

```bash
BACKEND_SG=$(pulumi stack output backendSecurityGroupId)   # prod stack
RUNNER_SG=<runner instance SG id, from WS4 provisioning>

# Before the run:
aws ec2 authorize-security-group-ingress --group-id "$BACKEND_SG" \
  --protocol tcp --port 8080 --source-group "$RUNNER_SG"

# After the run (teardown checklist):
aws ec2 revoke-security-group-ingress --group-id "$BACKEND_SG" \
  --protocol tcp --port 8080 --source-group "$RUNNER_SG"
```

**Scrape loop** (on the runner, backgrounded for the duration of the run).
Task IPs are re-resolved every iteration because autoscaling adds tasks
mid-run:

```bash
mkdir -p metrics
while true; do
  ips=$(aws ecs describe-tasks --cluster districtr-prod \
    --tasks $(aws ecs list-tasks --cluster districtr-prod \
      --service-name backend --query 'taskArns[]' --output text) \
    --query 'tasks[].containers[].networkInterfaces[].privateIpv4Address' \
    --output text)
  ts=$(date +%s)
  for ip in $ips; do
    curl -s --max-time 5 "http://$ip:8080/metrics" > "metrics/${ts}_${ip}.prom"
  done
  sleep 15
done
```

Upload `metrics/` to the run's S3 results prefix afterwards (WS4 does this in
its artifact-upload step). Per-run cache hit rates: also snapshot
`http://$ip:8080/_debug/cache` before and after the run.

## Existing alarms that may fire during the run

All alarms in `infra/monitoring.ts` notify the `alarmEmails` recipients
(`Pulumi.prod.yaml`, currently dhalpern@, gfang@, peter@) via SNS email —
**tell them the run window beforehand** so nobody treats test alarms as an
incident.

Likely to fire:

| Alarm | Threshold | Why it may fire |
|---|---|---|
| `districtr-prod-backend-memory-high` | ECS memory avg > 85% for 2×5 min | Eval load fills the in-RAM graph cache — the plan's expected suspect |
| `districtr-prod-db-cpu-high` | RDS CPU avg > 80% for 2×5 min | Concurrent COPY writes + assignment reads |

Possible if things go wrong (also the run's abort criteria):

| Alarm | Threshold |
|---|---|
| `districtr-prod-alb-target-5xx` | > 25 target 5xx per 5 min |
| `districtr-prod-alb-elb-5xx` | > 10 ALB-generated 5xx per 5 min (timeouts / no healthy targets) |
| `districtr-prod-backend-unhealthy-targets` | any unhealthy backend target for 3×1 min |

Not expected: `frontend-memory-high`, `frontend-unhealthy-targets` (the test
never touches the frontend), `db-storage-low` (test docs are small).

Every alarm also sends an OK notification when it clears, so recipients get
two emails per firing.
