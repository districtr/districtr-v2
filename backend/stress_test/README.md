# Districtr stress-test harness

Locust harness implementing the traffic model in `STRESS_TEST_PLAN.md` §3:
viewers (non-homogeneous Poisson arrivals with a Beta(2,5) ramp-and-decay
intensity — spike ~20% into the window, exactly n per run; document + msgpack
assignments), eval users
(viewer sequence + `/evaluation`), and editors (uniform arrivals; 3 plan
copies via `copy_from_doc`, 3 msgpack full-replacement saves with
`last_updated_at` optimistic-concurrency threading; a subset also hits
`/evaluation` cache-cold after a save). Every user pre-samples its start
offset from a fixed RNG seed, sleeps until then, runs one session, and stops
— arrivals are reproducible and there is no steady-state looping.

## Setup

```sh
cd backend/stress_test
python3 -m venv venv && venv/bin/pip install -r requirements.txt
```

Do **not** add these deps to `backend/requirements.txt` — the prod image must
not grow.

## Configuration (env vars / `.env`, prefix `STRESS_`)

| Var | Default | Meaning |
|---|---|---|
| `STRESS_BASE_URL` | `http://localhost:8000` | API origin (prod: `https://api.beta.districtr.org`) |
| `STRESS_RUN_ID` | `dev` | Tags User-Agent (`districtr-stress-test/<run-id>`), manifests, doc names |
| `STRESS_SCALE` | `1.0` | Multiplies all population counts (`0.01` = 1% smoke) |
| `STRESS_WINDOW_SECONDS` | `900` | Arrival window |
| `STRESS_CONFIG_URL` | `https://tilesets1.cdn.districtr.org/stress-test/config.json` | Seed-plan config (plan §8); may be a local file path |
| `STRESS_SEED_MANIFEST` | `stress_test_manifest_<run-id>.json` | Seed manifest (input; written by `stress-test-seed` or `smoke_seed.py`) |
| `STRESS_RUNTIME_MANIFEST` | `stress_test_runtime_manifest_<run-id>.json` | Editor-created doc ids (output; input to cleanup) |
| `STRESS_RNG_SEED` | `42` | Arrival/perturbation RNG seed |
| `STRESS_SMOKE_ASSERT` | `false` | Assert-check on exit (see smoke run) |

Full-scale counts (`scenario.py`): 10,000 viewers + 2,500 eval + 250 editors
(50 with eval). `SCALE` scales each with a floor of 1.

## Seed plans

The harness needs seed *documents*, produced from the config JSON before the
run:

- **Production:** the `stress-test-seed` CLI command (plan §5 WS2) creates
  the 10 seed docs and writes the seed manifest.
- **Local/smoke:** `smoke_seed.py` does the same over HTTP from the fixture
  config.

Seed manifest shape (harness input):
`{"run_id": ..., "documents": [{"document_id", "districtr_map_slug", "use"}]}`.
The harness joins manifest docs with the config JSON by slug: `"view"` rows
serve viewers/eval, `"edit"` rows are what editors `copy_from_doc`.

## Running

Locust must be told the total user count (logged at startup:
`viewers + eval + editors`); spawn everyone up front and give the run time a
tail beyond the window for in-flight sessions:

```sh
cd backend/stress_test && . venv/bin/activate
export STRESS_RUN_ID=run1 STRESS_SCALE=1.0 STRESS_SEED_MANIFEST=stress_test_manifest_run1.json
export STRESS_BASE_URL=https://api.beta.districtr.org
locust --headless -f locustfile.py \
    -u 12750 -r 2000 -t 1080s \
    --csv run1 --html run1.html
```

- `-u` = total users (e.g. `SCALE=1.0` → 12,750; `SCALE=0.01` → 127).
- `-r` = spawn rate; users just sleep after spawning, so spawn fast (a few
  thousand/s). All arrivals are governed by the pre-sampled offsets, not `-r`.
- `-t` = `WINDOW_SECONDS + ~180s` tail.
- `--csv <prefix>` writes `<prefix>_stats.csv` / `_stats_history.csv` /
  `_failures.csv`; `--html` writes the report. Stats are grouped per route via
  Locust `name=` (`/api/document/{id}`, `/api/get_assignments/{id}`,
  `/api/document/{id}/evaluation`, `/api/create_document`,
  `/api/assignments`), so per-document URLs collapse into one row each.
- Editor 409s are recorded (counter logged at exit) but non-fatal.

**Runtime manifest / abort:** every editor-created `document_id` is
write-through flushed to `STRESS_RUNTIME_MANIFEST` at creation time and again
on shutdown, so a `SIGTERM` abort (`pkill -TERM -f locust` — Locust shuts
down gracefully and fires the quit hooks) never loses ids. Feed both
manifests to `stress-test-cleanup` afterwards.

If one Locust process CPU-saturates at full scale, split with
`--master` / `--worker --processes 4` (same env for all).

## Smoke run (local docker-compose stack)

```sh
cd backend/stress_test && . venv/bin/activate
export STRESS_RUN_ID=smoke STRESS_SCALE=0.01 STRESS_WINDOW_SECONDS=30 \
       STRESS_CONFIG_URL=fixtures/local_config.json STRESS_SMOKE_ASSERT=1
python smoke_seed.py
locust --headless -f locustfile.py -u 127 -r 127 -t 120s --csv smoke --html smoke.html
echo "exit=$?"   # 0 = smoke assert passed
```

The exit assert requires: every route above got ≥1 request with 0 failures,
and at least one editor save round-tripped `updated_at` (response
`updated_at` advanced and was accepted as the next save's
`last_updated_at`). `fixtures/local_config.json` mirrors the CDN config shape
and points at two Alabama maps present in the local sample data, with
assignment msgpacks under `fixtures/stress-data/`.

## Seed + cleanup (backend CLI)

`stress-test-seed` and `stress-test-cleanup` are Click commands in
`backend/cli.py` (logic in `stress_test/seed.py`). They need the backend
environment (DB access), so they run inside a backend task — local
docker-compose or prod via ECS Exec. Seeding itself goes over HTTP
(`POST /api/create_document` + `PUT /api/assignments`) so seed documents are
created exactly as the app creates them; the DB is used to validate config
slugs against `districtrmap` and, for cleanup, to drop assignment partitions.

- **seed**: one document per config row, metadata name
  `[STRESS-TEST] <run-id> seed <slug>`, manifest written write-through (a
  mid-seed failure still leaves a manifest of everything created so far).
  Flags `--config-url/--base-url/--run-id/--manifest` default to the
  `STRESS_*` env vars above; `--manifest` may be an `s3://` URI (use this in
  prod — the Fargate task filesystem is ephemeral).
- **cleanup**: `-m/--manifest` (repeatable, local or `s3://`) accepts both
  manifest shapes (seed `{documents: [...]}` and runtime
  `{created_documents: [...]}`). Deletes each document fully: drops its
  `document.assignments_<id>` / `document.community_assignments_<id>`
  partitions (mirroring `PATCH /api/assignments/{id}/reset`, minus the
  recreate), deletes comment/district-union/session/token rows, then the
  document row (`document.evaluation` cascades). Chunked commits (50
  docs/transaction) keep DDL lock counts under the 15s `lock_timeout`.
  Afterwards it lists any leftover document whose metadata name starts with
  `[STRESS-TEST]` and prompts before deleting them (`--yes` to skip the
  prompt — required non-interactively).

### Local (docker-compose)

```sh
docker compose exec backend python cli.py stress-test-seed \
    --config-url stress_test/fixtures/local_config.json --run-id run1 \
    --manifest stress_test/stress_test_manifest_run1.json
docker compose exec backend python cli.py stress-test-cleanup \
    -m stress_test/stress_test_manifest_run1.json \
    -m stress_test/stress_test_runtime_manifest_run1.json --yes
```

### Prod (ECS Exec into a backend task)

ECS Exec is enabled on the backend service (`infra/backend.ts`); the task
role already has S3 access to the backend bucket. The prod image's WORKDIR is
`/app` and the app listens on `localhost:8080` inside the task (seeding via
localhost skips the ALB hairpin; use `https://api.beta.districtr.org` instead
if you want seed traffic in the ALB logs).

```sh
CLUSTER=districtr-prod RUN_ID=run1
TASK=$(aws ecs list-tasks --cluster "$CLUSTER" --service-name backend \
    --query 'taskArns[0]' --output text)
aws ecs execute-command --cluster "$CLUSTER" --task "$TASK" \
    --container backend --interactive \
    --command "bash -c 'cd /app && python cli.py stress-test-seed \
        --run-id $RUN_ID --base-url http://localhost:8080 \
        --manifest s3://\$R2_BUCKET_NAME/stress-test/stress_test_manifest_$RUN_ID.json'"
```

After the run (runtime manifest uploaded to S3 by the runner, WS4):

```sh
aws ecs execute-command --cluster "$CLUSTER" --task "$TASK" \
    --container backend --interactive \
    --command "bash -c 'cd /app && python cli.py stress-test-cleanup \
        -m s3://\$R2_BUCKET_NAME/stress-test/stress_test_manifest_$RUN_ID.json \
        -m s3://\$R2_BUCKET_NAME/stress-test/stress_test_runtime_manifest_$RUN_ID.json \
        --yes'"
```

(`\$R2_BUCKET_NAME` resolves inside the task — it's the backend bucket env
var. `stress-test-seed` uses no CDN override, so it reads the real
`stress-test/config.json`; it aborts before creating anything if any config
slug is missing from the prod `districtrmap` table.)

## Runner (ephemeral prod EC2)

Scripts in `runner/`. `provision.sh`/`teardown.sh` run on the operator's
machine with prod AWS credentials; `run.sh` runs on the instance. Everything
is discovered from the prod stack's `Name` tags (`districtr-prod-vpc`,
`-public-0`, `-backend-sg`) — nothing is hard-coded. `RESULTS_BUCKET` is the
backend S3 bucket (Pulumi `s3BucketName` / task env `R2_BUCKET_NAME`).

**1. Provision** — one c7i.4xlarge (AL2023) in a prod public subnet;
egress-only SG, no SSH keys (SSM Session Manager only), instance profile =
SSM core + S3 `stress-test/*` + ECS read (for the scrape loop):

```sh
cd backend/stress_test/runner
RESULTS_BUCKET=<bucket> REPO_SHA=$(git rev-parse origin/main) ./provision.sh
```

User data clones the repo at `REPO_SHA` and installs the harness venv
(~2 min; done when `/home/ec2-user/bootstrap-done` exists, log at
`/var/log/stress-runner-bootstrap.log`). The script prints `INSTANCE_ID`,
the SG ids, and the `authorize-security-group-ingress` one-liner for the
temporary 8080 rule that lets the runner scrape `/metrics`
(see `infra/athena/OBSERVABILITY.md`) — run it before the test.

**2. Seed** via the ECS Exec one-liner above, with
`--manifest s3://$RESULTS_BUCKET/stress-test/stress_test_manifest_$RUN_ID.json`
(run.sh pulls it from exactly that key).

**3. Run** (detached — survives a dropped SSM session):

```sh
aws ssm send-command --region us-east-2 --instance-ids "$INSTANCE_ID" \
    --document-name AWS-RunShellScript \
    --parameters 'commands=["env RESULTS_BUCKET=<bucket> RUN_ID=run1 SCALE=1.0 /home/ec2-user/districtr-v2/backend/stress_test/runner/run.sh > /home/ec2-user/run1.log 2>&1"],executionTimeout=["5400"]'
# watch: aws ssm start-session --target "$INSTANCE_ID", then tail -f /home/ec2-user/run1.log
```

`run.sh` env: `RUN_ID`/`RESULTS_BUCKET` (required), `SCALE` (default 0.01),
`WINDOW_SECONDS` (900), `BASE_URL` (`https://api.beta.districtr.org`),
`CLUSTER` (`districtr-prod`), `CONFIG_URL` (optional `STRESS_CONFIG_URL`
override). It computes `-u` from `SCALE` (12,750 at 1.0), runs
`-t WINDOW+180s`, snapshots `/_debug/cache` before/after, scrapes `/metrics`
from every backend task IP every 15s (re-resolving IPs so autoscaled tasks
are included), then uploads Locust CSV/HTML, `locust.log`, cache snapshots,
`metrics/`, and both manifests to
`s3://$RESULTS_BUCKET/stress-test/<RUN_ID>/` — plus the runtime manifest at
`stress-test/stress_test_runtime_manifest_<RUN_ID>.json`, where the cleanup
one-liner expects it. It exits with Locust's exit code (non-zero when any
request failed) *after* uploading.

**Abort switch** — graceful SIGTERM: the harness flushes the runtime
manifest and run.sh still uploads all artifacts:

```sh
aws ssm send-command --region us-east-2 --instance-ids "$INSTANCE_ID" \
    --document-name AWS-RunShellScript \
    --parameters 'commands=["pkill -TERM -f locust"]'
```

**4. Teardown** (after `stress-test-cleanup`): revokes the temp 8080 rule,
terminates the instance, deletes the runner SG and IAM role/profile:

```sh
./teardown.sh
```
