#!/usr/bin/env bash
# Hand-runner for the skill-cut challenge evals (until `claude plugin eval` early
# access is enabled — see README.md). Runs each case's prompt in fresh `claude -p`
# sessions against two isolated repo copies:
#   Arm A: current skills (cut content absent)
#   Arm B: pre-rebuild skills (cut content present), restored from $BASELINE_COMMIT
# Transcripts land in results/<timestamp>/<case>-<arm>-<trial>.json for rubric grading.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BASELINE_COMMIT="${BASELINE_COMMIT:-8da38925^}" # parent of the rebuild commit
TRIALS="${TRIALS:-2}"
MODEL="${MODEL:-sonnet}"
WORK="${WORK:-$(mktemp -d /tmp/skill-evals.XXXX)}"
OUT="$(cd "$(dirname "$0")" && pwd)/results/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

echo "work dir: $WORK  results: $OUT  baseline: $BASELINE_COMMIT"

setup_arm() { # $1=arm dir, $2=skills source (current|baseline)
  mkdir -p "$1"
  git -C "$REPO_ROOT" archive HEAD | tar -x -C "$1"
  # .claude/ is a gitignored sync target — the archive has no skills. Build them.
  if [ "$2" = baseline ]; then
    rm -rf "$1/.agents/skills"
    git -C "$REPO_ROOT" archive "$BASELINE_COMMIT" .agents/skills | tar -x -C "$1"
  fi
  (cd "$1" && ./scripts/sync-skills.sh --claude >/dev/null)
  ls "$1/.claude/skills" | head -3
}

[ -d "$WORK/armA" ] || setup_arm "$WORK/armA" current
[ -d "$WORK/armB" ] || setup_arm "$WORK/armB" baseline

for case_dir in "$(dirname "$0")"/evals/*/; do
  case_name="$(basename "$case_dir")"
  # strip frontmatter from prompt.md
  prompt="$(awk 'f{print} /^---$/{c++; if(c==2) f=1}' "$case_dir/prompt.md")"
  for arm in A B; do
    for t in $(seq 1 "$TRIALS"); do
      outfile="$OUT/${case_name}-${arm}-${t}.json"
      [ -s "$outfile" ] && continue
      echo ">> $case_name arm$arm trial$t"
      (cd "$WORK/arm$arm" && claude -p "$prompt" \
        --model "$MODEL" --max-turns 30 \
        --setting-sources project \
        --allowed-tools "Read,Grep,Glob,Skill" \
        --output-format stream-json --verbose </dev/null >"$outfile") || echo "  (nonzero exit)"
    done
  done
done

echo "done — grade transcripts in $OUT against each case's graders/rubric.md"
