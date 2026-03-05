# DOCKER_EXPERT

## Purpose
Define the source of truth for local containerized development, service startup order, environment configuration, and quality-gate commands.

## When To Use
- You need to run the full stack locally (frontend, backend, db).
- You are changing `Dockerfile*`, `docker-compose.yml`, or env-file wiring.
- You need reproducible lint/test/build commands in containers.

## Canonical Files
- `docker-compose.yml`
- `app/Dockerfile.dev`
- `backend/Dockerfile.dev`
- `pre-commit/Dockerfile.dev`
- `README.md`
- `app/.env.docker`
- `backend/.env.docker`

## Hard Invariants
- Database is **PostgreSQL 15 with PostGIS 3.3** (`postgis/postgis:15-3.3-alpine`).
- Compose build contexts stay aligned with monorepo boundaries:
  - frontend: `./app`
  - backend: `./backend`
  - pre-commit: `./pre-commit`
  - pipelines: `./pipelines`
- Backend service must not start API before migrations (`alembic upgrade head`).
- Backend depends on DB healthcheck; do not remove the DB health dependency.
- Frontend runtime in Docker is Bun-based (`bun install && bun run dev`).
- Volume mounts must preserve hot reload and source-of-truth directories.
- Data-loading behavior remains opt-in via `LOAD_DATA=true`.

## Preferred Patterns
- Use `docker-compose up --build` from repo root for full stack bring-up.
- Use `docker-compose up db backend` when iterating backend-only.
- Keep env handling explicit (`.env.docker`, root `.env` for optional flags).
- Run quality gates in containers to match team workflow:
  - `docker-compose up pre-commit`
  - `docker-compose exec frontend bun run build`
  - `docker-compose exec backend pytest -v`

## Anti-Patterns
- Running frontend dependencies from repo root instead of `app/` context.
- Editing compose service commands without validating migration/load behavior.
- Assuming data is auto-loaded without `LOAD_DATA=true`.
- Repointing compose volumes to non-canonical paths.

## Change Checklist
1. Confirm modified compose service still uses correct build context and mounted paths.
2. Confirm backend startup command still runs migrations before Uvicorn.
3. Confirm frontend service still installs deps and runs Bun dev server.
4. Validate env-file references (`app/.env.docker`, `backend/.env.docker`).
5. Run quality-gate container commands relevant to change scope.

## Validation Commands
- `docker compose config`
- `docker-compose up --build`
- `docker-compose up pre-commit`
- `docker-compose exec frontend bun run build`
- `docker-compose exec backend pytest -v`

## Common Failure Modes
- `backend` starts before DB is healthy due to changed dependency wiring.
- API fails on boot because migrations were removed from startup command.
- Frontend boot loops from missing Bun install in service command.
- Data expected but missing because `LOAD_DATA` was not set.
- Bind mounts masked image-installed dependencies unexpectedly.
