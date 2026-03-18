#!/usr/bin/env bash
#
# Downloads basemap style JSON files into public/ if they don't already exist.
# Reads the CDN base URL from the same env vars used by the app:
#   NEXT_PUBLIC_S3_BUCKET_URL_MIRROR1 ?? NEXT_PUBLIC_S3_BUCKET_URL
#
# Usage: ./scripts/fetch-basemap-styles.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
PUBLIC_DIR="$APP_DIR/public"

# Source .env if present (doesn't override existing env vars)
if [ -f "$APP_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$APP_DIR/.env"
  set +a
fi

BASE_URL="${NEXT_PUBLIC_S3_BUCKET_URL_MIRROR1:-${NEXT_PUBLIC_S3_BUCKET_URL:-}}"

if [ -z "$BASE_URL" ]; then
  echo "Error: NEXT_PUBLIC_S3_BUCKET_URL is not set. Cannot download basemap styles." >&2
  exit 1
fi

FILES=(
  "minimal-basemap-style.json"
  "streets-basemap-style.json"
  "satellite-basemap-style.json"
)

all_present=true
for file in "${FILES[@]}"; do
  if [ ! -f "$PUBLIC_DIR/$file" ]; then
    all_present=false
    break
  fi
done

if [ "$all_present" = true ]; then
  echo "Basemap styles already present in public/, skipping download."
  exit 0
fi

echo "Downloading basemap styles from $BASE_URL/basemaps/ ..."

for file in "${FILES[@]}"; do
  if [ -f "$PUBLIC_DIR/$file" ]; then
    echo "  $file (exists, skipping)"
  else
    echo "  $file (downloading)"
    curl -fsSL "$BASE_URL/basemaps/$file" -o "$PUBLIC_DIR/$file"
  fi
done

echo "Done."
