# 5. Docker Compose as the standard development environment

Date: 2024-09-23 (recorded retrospectively 2026-09-08)

## Status

Accepted.

## Context

Before this, running the backend, frontend, and PostGIS database together required manual environment setup, which was inconsistent across contributors' machines and made it hard to reason about additional Postgres extensions or version changes (PR #88).

## Decision

Provide a docker-compose configuration that runs backend, frontend, and a PostGIS database together with a single `docker-compose up`, mounting host folders for hot-reload and exposing environment variables (`LOAD_GERRY_DB_DATA`, renamed `LOAD_DATA` in PR #349, and `GPKG_DATA_DIR`) to control local data loading.

## Consequences

Local environment setup is a one-liner and stays consistent across contributors. Sample GerryDB data originally shipped in the repo (`sample_data/`); the directory is now gitignored except for its `config.json`, and local data is fetched from `s3://districtr-v2-dev/gerrydb/`. The compose configuration is kept separate from production `Dockerfile`s so it does not affect production image size or behavior.
