---
name: quality-gate
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

The script always runs `pre-commit`. It adds `bun run ts` and `bun run build`
when `app/` is touched, and `pytest` when `backend/` is touched. `build` and
`pytest` run as background jobs and are waited on together, since they are the
two slow gates and live in separate containers. It prints a pass/fail/skip
line per gate, tees each gate's output to its own log file under a temp
directory named in the final summary, and exits nonzero if anything failed.

## Cadence

Measured on a warm stack, 2026-08-24: `pre-commit` ~6s, `bun run ts` 2–3s,
frontend `build` ~78s, backend `pytest` ~96s.

Run the cheap gates (`pre-commit`, `ts`) on every relevant change — they're
fast enough that there's no reason not to. Run the expensive gates (`build`,
`pytest`) once per PR, right before push, scoped to whichever side the diff
touches — running them on every edit buys nothing for two gates that together
take over two minutes.

A re-run is unnecessary after merging in an unrelated `dev` update (no file
overlap with the current diff) — GitHub Actions re-validates every push
regardless, so a local re-run before that push adds a second wait for the same
answer.

## ESLint is deliberately not a gate

`bun run lint` works — it was fixed in PR #728 after `next lint` sat broken
since the Next 16 pin of December 2025, unnoticed for months precisely
because nothing gated on it. On 2026-08-24 the team decided to leave linting
unenforced rather than re-add it as a gate. `bun run lint` stays available for
manual use; this skill does not run it.
