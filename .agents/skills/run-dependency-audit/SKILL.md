---
name: run-dependency-audit
description: Surveys outdated and vulnerable dependencies across the frontend (Bun) and backend (pip/uv) toolchains and triages findings by severity and exposure. Use when a dependency manifest or lockfile changes, or when asked to check for outdated packages, security advisories, or whether a dependency needs bumping.
paths:
  - "app/package.json"
  - "app/bun.lock"
  - "backend/requirements.txt"
---

# Dependency audit

This is a survey-and-triage procedure, not an auto-upgrade tool: it enumerates
what's outdated or flagged, and the output is findings to file, not diffs to
apply. Bumping a dependency is a separate, deliberate change — do it one
package at a time, with its own quality-gate run.

## Frontend (Bun)

Bun is the frontend package manager (`app/bun.lock`) and has both checks
built in — no extra tooling needed:

```bash
cd app && bun outdated       # every dependency vs. its latest matching/available version
cd app && bun audit          # known vulnerabilities in installed packages, via the npm advisory DB
```

## Backend (pip / uv)

`backend/requirements.txt` (a uv-generated lockfile) is the source of truth —
`backend/pyproject.toml` holds only tool config, not dependency declarations.

```bash
docker-compose exec backend pip list --outdated   # installed vs. latest on PyPI
uvx pip-audit -r backend/requirements.txt          # known vulnerabilities, run from repo root
```

`pip list --outdated` needs the container (it reads the installed
environment); `pip-audit` reads the lockfile directly, so `uvx` runs it on the
host without installing anything. If `uvx pip-audit` crashes in `ensurepip`
(seen 2026-09-03 on macOS), run it inside the container instead:
`docker-compose exec backend pip install -q pip-audit && docker-compose exec
backend pip-audit -r requirements.txt`.

Triage findings by severity, actual exposure, and update cost, then file them
(one issue per package or tightly-related group) rather than upgrading inline —
a bump belongs in its own PR so a regression bisects to it alone. Next.js
major bumps go through [`run-next-upgrade`](../run-next-upgrade/SKILL.md).
