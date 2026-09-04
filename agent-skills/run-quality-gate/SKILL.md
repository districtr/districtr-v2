---
name: run-quality-gate
description: How to verify changes in this repo — which of the quality gates (pre-commit lint, frontend type-check and build, backend pytest) a situation actually calls for, and the commands to run them. Use when about to push a branch, hand off or merge work, open a PR, or whenever asked to run the quality gates or check whether the code is green.
---

# Quality gates

Decide what needs verifying from the situation, then run those commands
directly. A **checkpoint** below means any moment work leaves this session:
a push, a handoff to the orchestrator, a merge, opening a PR.

- **pre-commit** (~6s) and **frontend ts** (2–3s): cheap enough to run whenever
  they could catch anything — after any frontend edit, at any checkpoint.
- **Frontend build** (~78s): at any checkpoint whose diff touches `app/`. No
  CI covers the build outside
  previews/deploys, so the local run is the only gate there is.
- **Backend pytest** (~96s full suite): **exactly two cases, otherwise skip.**
  (1) You expect a failure and are fixing it — verify with just that test or
  file, not the suite. (2) The checkpoint is one CI never sees (handing
  unpushed work to the orchestrator, a pre-merge check) — a full run is
  permitted. Never before an operation that triggers the backend-test CI
  (`test-backend.yml` runs the suite on every push touching `backend/**`, any
  branch), and not before a handoff you expect green.

Report which gates you skipped and why.

## Commands

Requires the stack running (`docker-compose up -d db`; other services start as
needed).

```bash
docker-compose up pre-commit                      # lint (Python + JS)
docker-compose exec frontend bun run ts           # FE type check
docker-compose exec frontend bun run build        # FE build
docker-compose exec backend pytest tests/<file> -v  # scoped backend test
docker-compose exec backend pytest                # full backend suite
```

Two scoping one-liners:

```bash
git diff --name-only $(git merge-base HEAD dev)   # this branch's own changes
                                                  # (swap dev for origin/<branch>
                                                  #  to scope to unpushed work)
gh run list --commit $(git rev-parse HEAD) --workflow test-backend.yml \
  --json status,conclusion                        # has CI already tested this SHA?
```

## ESLint is deliberately not a gate

Team decision, 2026-08-24: linting stays unenforced (`next lint` had sat
broken and unnoticed since Dec 2025 precisely because nothing gated on it —
fixed in PR #728). `bun run lint` is available for manual use; this skill
does not run it.
