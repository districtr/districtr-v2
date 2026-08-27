#!/usr/bin/env bash
# Run the repo's verification gates, scoped to what the diff actually touches.
#
# Usage: run-gates.sh [base-ref]
#   base-ref defaults to "dev". Changed files are computed against the merge
#   base of HEAD and base-ref, so the scope reflects this branch's own work
#   even when base-ref has moved on since the branch was cut.
#
# Gates:
#   - pre-commit: always (cheap, catches formatting/lint issues on any file type)
#   - frontend ts + build: only when app/ is touched
#   - backend pytest: only when backend/ is touched
# Build and pytest run concurrently since they are the two expensive gates and
# touch disjoint containers (frontend vs backend), so there is no contention
# to serialize for.
set -euo pipefail

base_ref="${1:-dev}"

log_dir="$(mktemp -d)"
pre_commit_log="${log_dir}/pre-commit.log"
ts_log="${log_dir}/frontend-ts.log"
build_log="${log_dir}/frontend-build.log"
pytest_log="${log_dir}/backend-pytest.log"

if ! merge_base="$(git merge-base HEAD "${base_ref}" 2>/dev/null)"; then
  echo "error: could not find a merge base between HEAD and '${base_ref}'." >&2
  echo "       pass an explicit base-ref, e.g. run-gates.sh origin/dev" >&2
  exit 2
fi

changed_files="$(git diff --name-only "${merge_base}" -- . 2>/dev/null || true)"

touches() {
  # $1: path prefix to test the changed-file list against.
  printf '%s\n' "${changed_files}" | grep -q "^$1"
}

run_frontend=false
run_backend=false
touches "app/" && run_frontend=true
touches "backend/" && run_backend=true

echo "Base ref: ${base_ref} (merge-base ${merge_base})"
echo "Changed files: $(printf '%s\n' "${changed_files}" | grep -c . || true)"
echo "Frontend gates: $([ "${run_frontend}" = true ] && echo enabled || echo skipped)"
echo "Backend gates:  $([ "${run_backend}" = true ] && echo enabled || echo skipped)"
echo

# --- pre-commit: always runs, always sequential (fast; sets up the rest) ---
pre_commit_status=0
echo "Running pre-commit..."
if docker-compose up pre-commit >"${pre_commit_log}" 2>&1; then
  echo "pre-commit: PASS"
else
  pre_commit_status=$?
  echo "pre-commit: FAIL (exit ${pre_commit_status})"
fi
echo

# --- frontend ts: cheap, sequential ---
ts_status=0
ts_ran=false
if [ "${run_frontend}" = true ]; then
  ts_ran=true
  echo "Running frontend type check..."
  if docker-compose exec -T frontend bun run ts >"${ts_log}" 2>&1; then
    echo "frontend ts: PASS"
  else
    ts_status=$?
    echo "frontend ts: FAIL (exit ${ts_status})"
  fi
  echo
fi

# --- build (frontend) + pytest (backend): expensive, run concurrently ---
build_status=0
build_pid=""
build_ran=false
if [ "${run_frontend}" = true ]; then
  build_ran=true
  echo "Starting frontend build in background..."
  docker-compose exec -T frontend bun run build >"${build_log}" 2>&1 &
  build_pid=$!
fi

pytest_status=0
pytest_pid=""
pytest_ran=false
if [ "${run_backend}" = true ]; then
  pytest_ran=true
  echo "Starting backend pytest in background..."
  docker-compose exec -T backend pytest >"${pytest_log}" 2>&1 &
  pytest_pid=$!
fi

if [ -n "${build_pid}" ]; then
  wait "${build_pid}" && build_status=0 || build_status=$?
fi
if [ -n "${pytest_pid}" ]; then
  wait "${pytest_pid}" && pytest_status=0 || pytest_status=$?
fi

[ "${build_ran}" = true ] && {
  if [ "${build_status}" -eq 0 ]; then
    echo "frontend build: PASS"
  else
    echo "frontend build: FAIL (exit ${build_status})"
  fi
}
[ "${pytest_ran}" = true ] && {
  if [ "${pytest_status}" -eq 0 ]; then
    echo "backend pytest: PASS"
  else
    echo "backend pytest: FAIL (exit ${pytest_status})"
  fi
}

echo
echo "=== Summary ==="
overall_status=0
report_gate() {
  # $1: label, $2: ran flag, $3: status, $4: log path
  if [ "$2" = true ]; then
    if [ "$3" -eq 0 ]; then
      echo "  PASS  $1  (log: $4)"
    else
      echo "  FAIL  $1  (log: $4)"
      overall_status=1
    fi
  else
    echo "  SKIP  $1"
  fi
}
report_gate "pre-commit     " true "${pre_commit_status}" "${pre_commit_log}"
report_gate "frontend ts    " "${ts_ran}" "${ts_status}" "${ts_log}"
report_gate "frontend build " "${build_ran}" "${build_status}" "${build_log}"
report_gate "backend pytest " "${pytest_ran}" "${pytest_status}" "${pytest_log}"

echo
echo "Logs kept in: ${log_dir}"

exit "${overall_status}"
