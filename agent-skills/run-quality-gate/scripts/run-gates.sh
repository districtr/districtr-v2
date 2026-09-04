#!/usr/bin/env bash
# Run the repo's verification gates, scoped to what the diff actually touches.
#
# Usage: run-gates.sh [base-ref] [--only gate[,gate...]]
#   base-ref defaults to "dev". Changed files are computed against the merge
#   base of HEAD and base-ref, so the scope reflects this branch's own work
#   even when base-ref has moved on since the branch was cut.
#   For an incremental push on a branch whose previous push was already green,
#   pass the remote tracking ref so only the new work is gated:
#     run-gates.sh "origin/$(git branch --show-current)"
#   --only overrides diff-derived selection entirely; gates:
#     pre-commit | ts | build | pytest      e.g. --only ts,pytest
#
# Default gate selection (without --only):
#   - pre-commit: always (cheap, catches formatting/lint issues on any file type)
#   - frontend ts + build: only when app/ is touched
#   - backend pytest: only when backend/ is touched
# Build and pytest run concurrently since they are the two expensive gates and
# touch disjoint containers (frontend vs backend), so there is no contention
# to serialize for.
set -euo pipefail

base_ref="dev"
only_gates=""
while [ $# -gt 0 ]; do
  case "$1" in
    --only) only_gates="$2"; shift 2 ;;
    --only=*) only_gates="${1#--only=}"; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) base_ref="$1"; shift ;;
  esac
done

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

run_pre_commit=true
run_ts=false
run_build=false
run_pytest=false
touches "app/" && run_ts=true && run_build=true
touches "backend/" && run_pytest=true

if [ -n "${only_gates}" ]; then
  run_pre_commit=false; run_ts=false; run_build=false; run_pytest=false
  IFS=',' read -ra gates <<< "${only_gates}"
  for g in "${gates[@]}"; do
    case "$g" in
      pre-commit) run_pre_commit=true ;;
      ts)         run_ts=true ;;
      build)      run_build=true ;;
      pytest)     run_pytest=true ;;
      *) echo "error: unknown gate '$g' (valid: pre-commit, ts, build, pytest)" >&2; exit 2 ;;
    esac
  done
fi

echo "Base ref: ${base_ref} (merge-base ${merge_base})"
echo "Changed files: $(printf '%s\n' "${changed_files}" | grep -c . || true)"
[ -n "${only_gates}" ] && echo "Gate selection overridden: --only ${only_gates}"
echo "Gates: pre-commit=$([ "${run_pre_commit}" = true ] && echo on || echo off) ts=$([ "${run_ts}" = true ] && echo on || echo off) build=$([ "${run_build}" = true ] && echo on || echo off) pytest=$([ "${run_pytest}" = true ] && echo on || echo off)"
echo

# --- pre-commit: always runs, always sequential (fast; sets up the rest) ---
pre_commit_status=0
if [ "${run_pre_commit}" = true ]; then
  echo "Running pre-commit..."
  if docker-compose up pre-commit >"${pre_commit_log}" 2>&1; then
    echo "pre-commit: PASS"
  else
    pre_commit_status=$?
    echo "pre-commit: FAIL (exit ${pre_commit_status})"
  fi
  echo
fi

# --- frontend ts: cheap, sequential ---
ts_status=0
ts_ran=false
if [ "${run_ts}" = true ]; then
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
if [ "${run_build}" = true ]; then
  build_ran=true
  echo "Starting frontend build in background..."
  docker-compose exec -T frontend bun run build >"${build_log}" 2>&1 &
  build_pid=$!
fi

# CI-reuse: when HEAD is exactly what's pushed (clean backend/ worktree, local
# tip == remote tip) and the test-backend workflow already completed for that
# SHA, reuse CI's verdict instead of a duplicate multi-minute local run. One
# gh call inside this script — no extra agent round-trips. Any doubt (dirty
# tree, unpushed commits, gh missing, run still in progress) falls through to
# a normal local run.
ci_verdict=""
if [ "${run_pytest}" = true ] && command -v gh >/dev/null 2>&1 \
   && [ -z "$(git status --porcelain -- backend/ 2>/dev/null)" ]; then
  head_sha="$(git rev-parse HEAD)"
  branch_name="$(git rev-parse --abbrev-ref HEAD)"
  remote_sha="$(git ls-remote origin "refs/heads/${branch_name}" 2>/dev/null | cut -f1)"
  if [ "${remote_sha}" = "${head_sha}" ]; then
    ci_verdict="$(gh run list --commit "${head_sha}" --workflow test-backend.yml \
      --json status,conclusion --jq \
      'first(.[] | select(.status == "completed")) | .conclusion // empty' \
      2>/dev/null || true)"
  fi
fi

pytest_status=0
pytest_pid=""
pytest_ran=false
pytest_reused=false
if [ "${run_pytest}" = true ] && [ "${ci_verdict}" = "success" ]; then
  pytest_ran=true
  pytest_reused=true
  echo "backend pytest: PASS (reusing CI test-backend run for pushed HEAD $(git rev-parse --short HEAD); local run skipped)"
  echo "CI verdict reused; see: gh run list --commit $(git rev-parse HEAD)" >"${pytest_log}"
elif [ "${run_pytest}" = true ]; then
  if [ "${ci_verdict}" = "failure" ]; then
    echo "note: CI test-backend FAILED for this exact commit — check the CI record" \
      "(gh run list --commit $(git rev-parse HEAD)); running locally anyway for a fresh log."
  fi
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
[ "${pytest_ran}" = true ] && [ "${pytest_reused}" = false ] && {
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
report_gate "pre-commit     " "${run_pre_commit}" "${pre_commit_status}" "${pre_commit_log}"
report_gate "frontend ts    " "${ts_ran}" "${ts_status}" "${ts_log}"
report_gate "frontend build " "${build_ran}" "${build_status}" "${build_log}"
report_gate "backend pytest " "${pytest_ran}" "${pytest_status}" "${pytest_log}"

echo
echo "Logs kept in: ${log_dir}"

exit "${overall_status}"
