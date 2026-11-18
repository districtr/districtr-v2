#!/usr/bin/env bash
# graphify-s3.sh — Share graphify-out/ (graph, report, extraction cache) through S3
# instead of committing it.
#
# Usage: GRAPHIFY_S3_URI=s3://bucket/prefix scripts/graphify-s3.sh <command> [aws flags]
#
# Commands:
#   push   Upload graphify-out/ to the prefix          (try: push --dryrun)
#   pull   Download the prefix into graphify-out/      (try: pull --dryrun)
#   url    Print a 7-day presigned link to graph.html
#
# Uses your ambient AWS credentials; extra arguments go straight to the aws CLI.
set -euo pipefail

: "${GRAPHIFY_S3_URI:?set GRAPHIFY_S3_URI, e.g. s3://my-bucket/graphify/districtr-v2}"
uri="${GRAPHIFY_S3_URI%/}"
cd "$(dirname "$0")/.."

# .graphify_python / .graphify_root hold this machine's absolute paths.
local_only=(--exclude ".graphify_python" --exclude ".graphify_root")

case "${1:-}" in
  # ponytail: no --delete, so a mistyped prefix can't wipe a bucket; stale cache
  # objects just accumulate. Add a lifecycle rule on the prefix if that matters.
  push) aws s3 sync graphify-out/ "$uri/" "${local_only[@]}" "${@:2}" ;;
  pull) aws s3 sync "$uri/" graphify-out/ "${local_only[@]}" "${@:2}" ;;
  # ponytail: presigned link, not public hosting. Role/SSO credentials cap the
  # lifetime at the session's; front the prefix with CloudFront for a stable URL.
  url) aws s3 presign "$uri/graph.html" --expires-in 604800 "${@:2}" ;;
  *)
    sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//' >&2
    exit 2
    ;;
esac
