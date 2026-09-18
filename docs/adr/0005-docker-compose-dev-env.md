# 5. Docker Compose as the standard development environment

Date: 2024-09-23 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Before this, running the backend, frontend, and PostGIS database together required manual environment setup, which was inconsistent across contributors' machines and made it hard to reason about additional Postgres extensions or version changes (PR #88).

## Decision

Provide a docker-compose configuration that runs backend, frontend, and a PostGIS database together with a single `docker-compose up`, mounting host folders for hot-reload and exposing environment variables (`LOAD_GERRY_DB_DATA`, `GPKG_DATA_DIR`) to control local data loading.

## Consequences

Local environment setup is a one-liner and stays consistent across contributors. Sample GerryDB data ships in the repo (`sample_data/`) so a fresh checkout can load real data locally. The compose configuration is kept separate from production `Dockerfile`s so it does not affect production image size or behavior.
