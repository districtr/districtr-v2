---
name: run-quality-gate
description: Runs this repo's verification suite (pre-commit lint, frontend type-check and build, backend pytest), scoped to what the current diff actually touches, with the expensive gates run concurrently. Use when about to push a branch, before opening a PR, or whenever asked to run the quality gates or check whether the code is green.
---

# Quality gate

## Run it

```bash
${CLAUDE_SKILL_DIR}/scripts/run-gates.sh [base-ref] [--only gate,...]
```

`base-ref` defaults to `dev`. The script diffs HEAD against the merge-base with
`base-ref`, not against `base-ref`'s current tip — so a `dev` update that
landed after this branch was cut doesn't drag in unrelated files. Requires the
stack already running (`docker-compose up -d db`; `pre-commit`, `frontend`,
`backend` services get started as needed).

**Scope to what actually needs re-checking — the script's default is the whole
branch diff, which repays costs already paid on a repeat push.** Two levers:

- Incremental push on a branch whose previous push was green: pass the remote
  tracking ref so only the new work selects gates —
  `run-gates.sh "origin/$(git branch --show-current)"`.
- Your judgment says only specific gates are relevant (e.g. a Dockerfile fix
  verified by a real `docker build` needs lint, not the FE build):
  `--only pre-commit,pytest` overrides the diff-derived selection. Say in your
  report which gates you skipped and why.

## Cadence

Mid-work verification is a judgment call, and the cheapest sufficient check is
usually an ad hoc command, not this script — `bun run ts` after a frontend
edit, one pytest file after a backend fix. That habit is correct; this skill is
the **checkpoint before sharing work** — a push, a handoff to the
orchestrator, a pre-merge check — scoped as above. Cheap gates (`pre-commit`
~6s, `ts` 2–3s) cost nothing to include; the expensive gates (`build` ~78s,
`pytest` ~96s) are the reason scoping matters.

**Skip the local pytest when your next operation triggers the backend-test
CI anyway** (`test-backend.yml` runs the suite on every push touching
`backend/**`, any branch) — running it locally right before such a push pays
twice for the same verdict (`--only pre-commit,ts,build` covers the rest).
Run pytest locally when iterating on expected failures, or at a checkpoint
CI never sees (a worker handing a branch to the orchestrator, a pre-merge
check of unpushed work). The script automates one shortcut itself: when HEAD is
exactly the pushed tip (clean `backend/` worktree) and CI's `test-backend.yml`
already completed for that SHA, it reuses CI's verdict instead of running
pytest locally — the summary line says so when it happens. A CI *failure* for
the pushed SHA still runs pytest locally (fresh log) and prints a pointer to
the CI record. No equivalent CI job covers `bun run build` outside
previews/deploys, so the build gate always runs locally.

## ESLint is deliberately not a gate

Team decision, 2026-08-24: linting stays unenforced (`next lint` had sat
broken and unnoticed since Dec 2025 precisely because nothing gated on it —
fixed in PR #728). `bun run lint` is available for manual use; this skill
does not run it.
