#!/usr/bin/env bash
# Benchmark stack: local data server, read-only API proxy, prod build of the app.
#
#   e2e/bench/stack.sh servers   # range server :8020 + API proxy :8010 (background)
#   e2e/bench/stack.sh build     # next build with the bench URLs baked in
#   e2e/bench/stack.sh start     # next start -p 3200 (background)
#   e2e/bench/stack.sh status
#   e2e/bench/stack.sh stop      # stops what this script started (not docker)
#
# Data root: $BENCH_ROOT/www (default <repo>/tmp/topology-bench); logs and pids in $BENCH_ROOT.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$HERE/../.." && pwd)"
REPO_DIR="$(git -C "$APP_DIR" rev-parse --path-format=absolute --git-common-dir | xargs dirname)"
BENCH_ROOT="${BENCH_ROOT:-$REPO_DIR/tmp/topology-bench}"
DATA_PORT="${DATA_PORT:-8020}"
PROXY_PORT="${PROXY_PORT:-8010}"
APP_PORT="${APP_PORT:-3200}"
BACKEND="${BACKEND:-http://127.0.0.1:8000}"
DATA_URL="http://localhost:$DATA_PORT"

export NEXT_TELEMETRY_DISABLED=1
export NEXT_PUBLIC_ENVIRONMENT=local
export NEXT_PUBLIC_API_URL="http://localhost:$PROXY_PORT"
export NEXT_SERVER_API_URL="$BACKEND"
export NEXT_PUBLIC_S3_BUCKET_URL="$DATA_URL"
export NEXT_PUBLIC_S3_BUCKET_URL_MIRROR1="$DATA_URL"
export NEXT_PUBLIC_S3_BUCKET_URL_MIRROR2="$DATA_URL"
export NEXT_PUBLIC_TOPOLOGY_URL="$DATA_URL"
export CMS_URL="${CMS_URL:-http://localhost:8001}"
export NEXT_PUBLIC_CMS_URL="${NEXT_PUBLIC_CMS_URL:-http://localhost:8001}"
# No Turnstile in the bench build: getSessionToken returns null without a site key.
export NEXT_PUBLIC_TURNSTILE_SITE_KEY=""
export NEXT_PUBLIC_TURNSTILE_SESSION_SITE_KEY=""

start_bg() { # name, command...
  local name="$1"; shift
  if [ -f "$BENCH_ROOT/$name.pid" ] && kill -0 "$(cat "$BENCH_ROOT/$name.pid")" 2>/dev/null; then
    echo "$name already running (pid $(cat "$BENCH_ROOT/$name.pid"))"; return
  fi
  nohup "$@" >"$BENCH_ROOT/$name.log" 2>&1 &
  echo $! >"$BENCH_ROOT/$name.pid"
  echo "$name started (pid $!, log $BENCH_ROOT/$name.log)"
}

stop_bg() {
  local f="$BENCH_ROOT/$1.pid"
  if [ -f "$f" ]; then
    # next start forks; kill the process group's children too.
    pkill -P "$(cat "$f")" 2>/dev/null || true
    kill "$(cat "$f")" 2>/dev/null || true
    rm -f "$f"
    echo "$1 stopped"
  fi
}

mkdir -p "$BENCH_ROOT"
case "${1:-}" in
  servers)
    start_bg range_server python3 -I "$HERE/range_server.py" --root "$BENCH_ROOT/www" --port "$DATA_PORT"
    start_bg api_proxy python3 -I "$HERE/api_proxy.py" --port "$PROXY_PORT" --upstream "$BACKEND"
    ;;
  build)
    cd "$APP_DIR" && bun run build
    ;;
  start)
    cd "$APP_DIR" && start_bg next_app bun run start -p "$APP_PORT"
    ;;
  stop)
    stop_bg next_app; stop_bg api_proxy; stop_bg range_server
    ;;
  status)
    for p in "$DATA_PORT" "$PROXY_PORT" "$APP_PORT"; do
      printf ':%s ' "$p"; curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:$p/" || echo down
    done
    ;;
  *)
    sed -n '2,10p' "$0"; exit 1
    ;;
esac
