---
name: run-quality-gate
description: Runs this repo's verification suite (pre-commit lint, frontend type-check and build, backend pytest), scoped to what the current diff actually touches, with the expensive gates run concurrently. Use when about to push a branch, before opening a PR, or whenever asked to run the quality gates or check whether the code is green.
---

# Quality gate

## Run it

```bash
${CLAUDE_SKILL_DIR}/scripts/run-gates.sh [base-ref]
```

`base-ref` defaults to `dev`. The script diffs HEAD against the merge-base with
`base-ref`, not against `base-ref`'s current tip — so a `dev` update that
landed after this branch was cut doesn't drag in unrelated files. Requires the
stack already running (`docker-compose up -d db`; `pre-commit`, `frontend`,
`backend` services get started as needed by `docker-compose up` /
`docker-compose exec`).

## Cadence

Run the cheap gates (`pre-commit` ~6s, `bun run ts` 2–3s) freely; run the
expensive gates (`build` ~78s, `pytest` ~96s) once per PR, right before push —
not on every edit. The script automates one shortcut itself: when HEAD is
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
