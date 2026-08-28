---
name: learn-infra
description: How the system is built, wired, run, and deployed — the local docker-compose stack, env-file wiring, CI workflows, and the AWS hosting (Pulumi/ECS/RDS), including deploys, rollbacks, and PR preview environments. Use when changing docker-compose.yml, a Dockerfile, an env-file reference, a GitHub Actions workflow, or anything under infra/, or when bringing up the local stack, deploying, rolling back, or debugging a preview environment.
user-invocable: false
---

# Infra

## Local stack

Almost everything about the local stack is readable directly from
`docker-compose.yml` and the `Dockerfile.dev` files — read those first. The few facts
that are easy to miss or span files:

- **The backend's boot ordering is two guarantees in one place**: `depends_on: db:
  condition: service_healthy` (waits for `pg_isready`, not just the port) and the single
  chained command `alembic upgrade head && ... && uvicorn`. Weakening either one
  reintroduces a boot race — [references/troubleshooting.md](references/troubleshooting.md)
  covers the resulting symptoms.
- **In the local compose stack, `frontend`'s `node_modules` is the host's, not the
  image's.** The dev image contains a `node_modules` from its build-time `bun install`,
  but at runtime the `./app/node_modules:/app/node_modules` bind mount hides that copy —
  the container's `bun install && bun run dev` command installs into the mounted host
  directory on every start, so a `package.json` change needs no image rebuild. (AWS is
  the opposite: the production image bakes dependencies in and mounts nothing.)
- **Env files are per-service and gitignored**: `backend/.env.docker`, `app/.env.docker`,
  `pipelines/.env`, each with a checked-in `*.example` template. `backend/.env.dev`,
  `.env.test`, `.env.production` and their `app/` counterparts serve non-Docker runs.

## AWS deployment

Hosting is two fully isolated Pulumi stacks — `dev` (deployed from the `dev` branch) and
`prod` (from `main`): ECS Fargate services behind an ALB, RDS PostGIS, images in ECR,
secrets in SSM. **`infra/README.md` is the authoritative deep reference** — architecture
diagram, per-service table, deploy mechanics, preview model, operations (rollback,
secrets, DB access), and first-time account setup. Read it before editing anything in
`infra/`; this section carries only what it doesn't.

- **Causal history**: hosting moved off Fly during 2026 — PR #649 (2026-08-05) was the
  final step, cutting PR previews over to AWS and deleting every Fly config and workflow
  from the repo; PRs #698/#701 then made the apex domain canonical. The Fly setup is
  fully gone in-repo — a reference to it anywhere is stale documentation.
- **Two deploy roles is a security boundary, not redundancy**: `preview.yml` runs a PR's
  own code under the narrow `districtr-gha-preview` role; the admin-scoped
  `districtr-gha-deploy` role is reserved for `dev`/`main` workflows. Keep any new
  `pull_request`-triggered workflow on the narrow role.
- **CI owns `pulumi up`**; local work is `pulumi preview` only (setup steps in the
  README's "Local development").
- Backend task sizing (`backendMemory` in `infra/config.ts`) and the graph LRU cache are
  coupled — see `learn-performance` before resizing either.

## CI

`.github/workflows/test-backend.yml` runs the backend suite in its own
`postgis/postgis:16-3.5-alpine` GitHub Actions service container — a different Postgres/
PostGIS minor version than local compose's `15-3.3-alpine`. This is a real, current gap:
a migration or query that behaves differently across a Postgres 15→16 or PostGIS
3.3→3.5 boundary could pass one environment and fail the other. `test-pipelines.yml`
covers the pipelines package; `deploy-api.yml`, `deploy-app.yml`, `infra.yml`, and
`preview.yml` are the deploy workflows described above.

## Territory

- `docker-compose.yml`; `app/Dockerfile.dev`, `backend/Dockerfile.dev`,
  `pre-commit/Dockerfile.dev` — the local stack.
- `infra/*.ts`, `infra/Pulumi.{dev,prod}.yaml`, `infra/config.ts` — the Pulumi program
  and per-stack config; `infra/README.md` — its reference docs;
  `infra/scripts/bootstrap.sh` — one-time account setup.
- `infra/athena/` — ALB access-log SQL and `OBSERVABILITY.md`.
- `.github/workflows/*.yml` — test workflows and the four deploy/preview workflows.
- `app/.env.docker.example`, `backend/.env.docker.example`, `pipelines/.env.example` —
  env-file templates.

## See also

- Quality-gate commands (lint/build/test invocations and their measured timings) live in
  a separate runbook, not here — this skill covers what the stack *is*, not how to
  validate a change against it.
- `learn-performance` — the memory-limit history behind the graph cache and
  `backendMemory` sizing; this skill covers wiring, that one covers the incidents.
- [references/troubleshooting.md](references/troubleshooting.md) — symptom → root cause
  → fix for the local boot/env failure modes.
