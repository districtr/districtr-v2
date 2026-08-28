---
name: learn-infra
description: How the system is built, wired, and run — docker-compose service topology, env-file wiring, Dockerfiles, and CI workflows. Use when changing docker-compose.yml, a Dockerfile, an env-file reference, or a GitHub Actions workflow, or when bringing up the local stack.
user-invocable: false
---

# Infra

## Invariants

- **The backend container runs migrations before serving traffic, in the same
  command.** `docker-compose.yml`'s `backend` service command is
  `alembic upgrade head && ... && uvicorn ...` — one shell command, not separate
  lifecycle steps, so there is no window where uvicorn is up against a schema the
  migrations haven't reached yet.
- **The backend container waits on the DB's healthcheck, not just its port.**
  `depends_on: db: condition: service_healthy`, with `db`'s healthcheck running
  `pg_isready`. Removing this condition (downgrading it to a bare `depends_on: [db]`)
  reintroduces a race where `alembic upgrade head` runs against a Postgres process that
  accepts TCP connections before it's actually ready to serve queries.
- **Compose build contexts are the monorepo boundaries**: `./app` (frontend),
  `./backend` (backend), `./pre-commit`, `./pipelines`. A Dockerfile referencing a path
  outside its own context won't build — this isn't a style preference, it's what the
  `context:` key in each service enforces.
- **Data loading is opt-in via `LOAD_DATA`.** The backend command's conditional
  (`if [ "${LOAD_DATA:-false}" = "true" ]; then python cli.py batch-create-districtr-maps
  ...; fi`) means an empty `.env` boots a schema with no map data — not a bug, the
  default.

## Topology

`docker-compose.yml` defines six services. `db` (`postgis/postgis:15-3.3-alpine`) is the
only one `backend` declares a `depends_on` for — `frontend`, `frontend-prod`, `pre-commit`,
and `pipelines` have none. `backend` builds from `./backend/Dockerfile.dev` (Python
3.12.7, GDAL + PostGIS client libs installed at image-build time — so Python dependency
changes require a rebuild, not just a bind-mount refresh) and mounts the repo's
`backend/`, `sample_data/`, `data/`, and `tmp/` directories for hot reload
(`--reload --reload-exclude '.venv/**/*.py'`). `frontend` builds from
`./app/Dockerfile.dev` (Node 24 + Bun; the image itself also runs `bun install` at build
time, but `frontend`'s `./app/node_modules:/app/node_modules` bind mount overrides that
with the host's `node_modules`, so the container's `bun install && bun run dev` command
reinstalls into the bind-mounted directory on every start) — no rebuild needed for a
`package.json` change, at the cost of a slower cold start. `frontend-prod` is the same
image built for a production-mode preview (`bun run build && bun run start`, port 3001,
gated behind the `prod` compose profile — it doesn't start with a bare `docker-compose
up`). `pre-commit` and `pipelines` are profile-gated utility services
(`profiles: ["pre-commit"]`, `["pipelines"]`) — they don't start by default either.

Env files are per-service: `backend/.env.docker`, `app/.env.docker`,
`pipelines/.env` — each gitignored, with a checked-in `.env.docker.example` /
`.env.example` template. `backend/.env.dev`, `.env.test`, `.env.production` and their
`app/` counterparts are the non-Docker equivalents used when running services directly.

## CI

`.github/workflows/test-backend.yml` runs the backend suite in its own
`postgis/postgis:16-3.5-alpine` GitHub Actions service container — a different Postgres/
PostGIS minor version than local compose's `15-3.3-alpine`. This is a real, current gap:
a migration or query that behaves differently across a Postgres 15→16 or PostGIS
3.3→3.5 boundary could pass one environment and fail the other. `test-pipelines.yml`
covers the pipelines package; `deploy-api.yml`, `deploy-app.yml`, `infra.yml`, and
`preview.yml` handle deployment and preview-environment provisioning, outside this
skill's scope.

## Territory

- `docker-compose.yml` — service definitions, build contexts, healthchecks, profiles.
- `app/Dockerfile.dev`, `backend/Dockerfile.dev`, `pre-commit/Dockerfile.dev` — per-service
  build steps.
- `app/.env.docker.example`, `backend/.env.docker.example`, `pipelines/.env.example` —
  env-file templates; the real `.env.docker`/`.env` files are gitignored.
- `.github/workflows/*.yml` — CI and deploy workflows.
- `README.md` — human-facing setup instructions.

## See also

- Quality-gate commands (lint/build/test invocations and their measured timings) live in
  a separate runbook, not here — this skill covers what the stack *is*, not how to
  validate a change against it.
- `learn-performance` — the memory-limit and lock-contention history that has shown up
  against this same compose topology (graph cache sizing, assignment-table locking under
  load); this skill covers wiring, that one covers the incidents.
- [references/troubleshooting.md](references/troubleshooting.md) — symptom → root cause
  → fix for the boot/env failure modes this topology is prone to.
