# Troubleshooting

Symptom → root cause → fix for the failure modes the local compose topology is prone to,
verified against the current `docker-compose.yml` (2026-08-27). Read this when the stack
won't boot, boots into a broken state, or behaves differently than expected after an
env/compose change.

## Contents

- [Backend can't reach the database](#backend-cant-reach-the-database)
- [Backend boots against a stale schema](#backend-boots-against-a-stale-schema)
- [Frontend never becomes reachable](#frontend-never-becomes-reachable)
- [No map data after a fresh boot](#no-map-data-after-a-fresh-boot)
- [Frontend native-dependency errors](#frontend-native-dependency-errors)

## Backend can't reach the database

**Symptom**: `backend` container exits or logs connection-refused errors against `db`
shortly after starting.

**Root cause**: `backend`'s `depends_on: db: condition: service_healthy` is what
sequences container start against Postgres actually being ready — `db`'s healthcheck
runs `pg_isready` every 10s, up to 5 retries, before compose considers it healthy. If
this `condition` is ever weakened to a bare service-start dependency (or removed
entirely), `backend` can start against a `db` container that accepts TCP connections
before Postgres has finished initializing, and `alembic upgrade head` — the first thing
`backend`'s command runs — fails.

**Fix**: keep the `condition: service_healthy` dependency on `db` intact. If the
symptom persists with that dependency present, the healthcheck itself is passing too
early for the actual workload — increase `interval`/`retries` rather than removing the
dependency.

## Backend boots against a stale schema

**Symptom**: API requests fail with column/table errors that a recent migration should
have fixed.

**Root cause**: `backend`'s command is `alembic upgrade head && ... && uvicorn ...` — one
shell command chained with `&&`, so a migration failure should abort the whole command
rather than letting uvicorn start anyway. If this ever gets split (e.g. migrations moved
to a separate init container or a `command:` override that drops the `alembic upgrade
head &&` prefix), the ordering guarantee is gone and uvicorn can start against
whatever schema state happened to exist at container start.

**Fix**: confirm the `command:` for `backend` in `docker-compose.yml` still runs
`alembic upgrade head` before `uvicorn`. If migrations were run manually against a
container that's already up, restart the container so the full command sequence,
including the migration step, runs again — a stale schema from a partial manual fix is
easy to end up in.

## Frontend never becomes reachable

**Symptom**: `frontend` container logs stay quiet, or repeatedly restart, without the
Next.js dev server ever printing its "ready" line.

**Root cause**: `frontend`'s command is `bun install && bun run dev` — dependencies
install fresh on every container start (not baked into the image), so a `bun install`
failure (network issue, a `package.json`/`bun.lock` mismatch) blocks `bun run dev` from
ever starting, and depending on the restart policy this can loop.

**Fix**: check the container's logs for the `bun install` step specifically, not just
the tail of the log (a hung or failed install produces no further output, which can look
like a silent hang rather than a failure). A `bun.lock` conflict after a branch switch is
the most common trigger — rebuilding the image or clearing the mounted `node_modules`
volume resolves a corrupted install.

## No map data after a fresh boot

**Symptom**: the stack is up and the schema is migrated, but no districtr maps are
available to open.

**Root cause**: this is the default, not a failure — `backend`'s command only runs
`python cli.py batch-create-districtr-maps` when `LOAD_DATA` is set to the literal
string `"true"` (`if [ "${LOAD_DATA:-false}" = "true" ]; then ...; fi`). Any other value,
including an unset `LOAD_DATA`, skips data loading.

**Fix**: set `LOAD_DATA=true` in the environment compose reads (root `.env` or however
the shell invoking `docker-compose up` is configured) before bringing the stack up, or
run the `batch-create-districtr-maps` CLI command manually against the running backend
container afterward.

## Frontend native-dependency errors

**Symptom**: a frontend dependency with native bindings (e.g. an image-processing or
bundler package) throws a platform-mismatch error inside the container, despite working
on the host.

**Root cause**: `frontend`'s volumes mount both `./app:/app` (the full source tree, for
hot reload) and `./app/node_modules:/app/node_modules` explicitly — the second mount
means the container's `node_modules` is the *host's* `node_modules` directory, not one
built fresh inside the Linux container. A package with platform-specific native binaries
installed on a non-Linux host (e.g. macOS, whether Intel or Apple Silicon) can end up
with the wrong-platform binary bind-mounted into the container, even though `bun install`
also runs inside the container on every start.

**Fix**: if a native-dependency error appears only inside the container, delete the
host's `app/node_modules` and let the container's `bun install` step populate a
Linux-native copy on next start, rather than assuming the container's own install
is what's present.
