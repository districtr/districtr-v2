#!/usr/bin/env bash
# One stress-test run, executed ON the runner instance (via SSM). Pulls the
# seed manifest from S3, runs Locust headless with the /metrics scrape loop
# (infra/athena/OBSERVABILITY.md), then uploads everything to
# s3://$RESULTS_BUCKET/stress-test/<RUN_ID>/ and prints the prefix. An abort
# (pkill -TERM -f locust) still uploads: Locust flushes the runtime manifest
# on SIGTERM and this script keeps going after Locust exits.
#
#   RESULTS_BUCKET=<bucket> RUN_ID=run1 SCALE=1.0 ./runner/run.sh
set -euo pipefail

RUN_ID="${RUN_ID:?Set RUN_ID}"
SCALE="${SCALE:-0.01}"
WINDOW_SECONDS="${WINDOW_SECONDS:-900}"
RESULTS_BUCKET="${RESULTS_BUCKET:?Set RESULTS_BUCKET to the backend S3 bucket name}"
BASE_URL="${BASE_URL:-https://api.beta.districtr.org}"
CLUSTER="${CLUSTER:-districtr-prod}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-2}"

cd "$(dirname "$0")/.."  # backend/stress_test
PY=venv/bin/python

S3_PREFIX="s3://${RESULTS_BUCKET}/stress-test"
RUN_PREFIX="${S3_PREFIX}/${RUN_ID}"
ART="artifacts/${RUN_ID}"
mkdir -p "$ART/metrics"

export STRESS_RUN_ID="$RUN_ID" STRESS_SCALE="$SCALE" \
  STRESS_WINDOW_SECONDS="$WINDOW_SECONDS" STRESS_BASE_URL="$BASE_URL"
[ -n "${CONFIG_URL:-}" ] && export STRESS_CONFIG_URL="$CONFIG_URL"

# Seed manifest written to S3 by `cli.py stress-test-seed --manifest s3://...`
SEED_MANIFEST="stress_test_manifest_${RUN_ID}.json"
aws s3 cp "${S3_PREFIX}/${SEED_MANIFEST}" "$SEED_MANIFEST"

# Total users = viewers + eval + editors at this SCALE (mirrors locustfile)
TOTAL=$("$PY" -c "
import scenario as s
scale = float('$SCALE')
print(s.scaled(s.VIEWERS, scale) + s.scaled(s.EVAL_USERS, scale) + s.scaled(s.EDITORS, scale))
")
SPAWN_RATE=$(( TOTAL < 2000 ? TOTAL : 2000 ))
DURATION=$(( WINDOW_SECONDS + 180 ))  # tail for in-flight sessions
echo "run_id=$RUN_ID scale=$SCALE window=${WINDOW_SECONDS}s users=$TOTAL -> $RUN_PREFIX/"

# --- /metrics scrapes straight off backend task IPs (requires the temp 8080
# SG rule from provision.sh output); IPs re-resolved every pass because
# autoscaling adds tasks mid-run. Failures are non-fatal.
task_ips() {
  local tasks
  tasks=$(aws ecs list-tasks --cluster "$CLUSTER" --service-name backend \
    --query 'taskArns[]' --output text)
  [ -n "$tasks" ] && [ "$tasks" != "None" ] || return 0
  # shellcheck disable=SC2086
  aws ecs describe-tasks --cluster "$CLUSTER" --tasks $tasks \
    --query 'tasks[].containers[].networkInterfaces[].privateIpv4Address' --output text
}

snapshot_cache() {  # $1 = before|after
  for ip in $(task_ips); do
    curl -s --max-time 5 "http://${ip}:8080/_debug/cache" \
      > "$ART/cache_${1}_${ip}.json" || true
  done
}

scrape_metrics() {
  while true; do
    local ts
    ts=$(date +%s)
    for ip in $(task_ips); do
      curl -s --max-time 5 "http://${ip}:8080/metrics" \
        -o "$ART/metrics/${ts}_${ip}.prom" || true
    done
    sleep 15
  done
}

snapshot_cache before
if ! ls "$ART"/cache_before_*.json >/dev/null 2>&1; then
  echo "WARNING: no /_debug/cache snapshot — is the temp 8080 SG rule authorized?" >&2
fi
scrape_metrics &
SCRAPE_PID=$!
trap 'kill "$SCRAPE_PID" 2>/dev/null || true' EXIT

set +e
venv/bin/locust --headless -f locustfile.py \
  -u "$TOTAL" -r "$SPAWN_RATE" -t "${DURATION}s" \
  --csv "$ART/$RUN_ID" --html "$ART/$RUN_ID.html" 2>&1 | tee "$ART/locust.log"
LOCUST_EXIT=${PIPESTATUS[0]}
set -e

kill "$SCRAPE_PID" 2>/dev/null || true
wait "$SCRAPE_PID" 2>/dev/null || true
snapshot_cache after

# --- Upload artifacts; runtime manifest also goes to the top-level prefix
# where the documented stress-test-cleanup one-liner expects it.
RUNTIME_MANIFEST="stress_test_runtime_manifest_${RUN_ID}.json"
cp "$RUNTIME_MANIFEST" "$ART/" 2>/dev/null || echo "no runtime manifest (no editor ran?)"
cp "$SEED_MANIFEST" "$ART/"
aws s3 cp --recursive "$ART/" "$RUN_PREFIX/"
[ -f "$RUNTIME_MANIFEST" ] && aws s3 cp "$RUNTIME_MANIFEST" "${S3_PREFIX}/${RUNTIME_MANIFEST}"

echo "locust exit code: $LOCUST_EXIT"
echo "Artifacts: $RUN_PREFIX/"
exit "$LOCUST_EXIT"
