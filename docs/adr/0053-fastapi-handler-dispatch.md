# 53. FastAPI handler dispatch: `def` vs `async def`

Date: 2026-09-08 (PR #729; adapted from the ADR block in that PR's description, recorded retrospectively 2026-09-08)

## Status

Accepted.

## Context

FastAPI routes declared with `def` are automatically dispatched to anyio's threadpool; routes declared with `async def` run directly on the event loop. Before PR #729, 38 route handlers were `async def` while doing blocking work — mostly synchronous SQLAlchemy queries — directly on the event loop, so one slow query stalled every request in the process. Three graph handlers (`get_unassigned_geoids`, `check_document_contiguity`, `get_connected_component_bboxes`) were `async def` only because they called `await run_in_threadpool(get_graph, ...)`; that pattern is not qualitatively different from a plain `def` handler calling `get_graph(...)` directly, since both dispatch blocking work to the same threadpool, and the wrapper obscured why the handler existed.

## Decision

Convert the 38 to `def`. The Turnstile session handlers stay `async def` because they genuinely `await` an `httpx` coroutine — real non-blocking I/O that belongs on the event loop. That distinction is the invariant: `async def` only when the handler has a real awaitable (network I/O via an async library); `def` for everything else. The rule has a second half: an awaitable justifies `async def`, but the whole body then runs on the event loop, so any blocking segment inside such a handler must itself be wrapped in `run_in_threadpool`. That is the wrapper's surviving role — bridging blocking portions of genuinely-async handlers, not wrapping a handler's entire body.

**Endpoints that are legitimately `async def`** (as of PR #729):

| Endpoint | Awaitable |
|---|---|
| `POST /session` | `verify_session_turnstile` — httpx Turnstile call |
| `PUT /api/assignments` | `request.body()` — streaming raw msgpack body |
| the comment-write endpoints (removed by [0059](0059-submissions-form-configs.md); today the submission create and finalize routes) | `turnstile.verify_turnstile` — httpx Turnstile call |

The assignments and submission routes wrap their sync SQLAlchemy work in `run_in_threadpool`; `POST /session` has none. The rule is not fully met: `update_assignments` decodes and validates the msgpack body on the event loop before its threadpool hand-off; `schedule_districtr_map_compose` (`admin_ops/main.py`) is `async def` with no awaitable and runs its precondition queries on the loop; and `create_admin_session` (`main.py`) and `schedule_gerrydb_import` (`admin_ops/main.py`) are `async def` with no awaitable, though they only mint a token or enqueue a task. Non-route `async def` (middleware, lifespan) are required to be async by Starlette's API and are not in scope; exception handlers may be plain `def`, which Starlette runs in the threadpool.

## Consequences

Concurrency parameters: anyio threadpool sized to 80 per worker in lifespan (`anyio.to_thread.current_default_thread_limiter().total_tokens = 80`); DB pool is 40 base + 20 overflow = 60 connections per worker. The image runs two workers (`--workers 2` in `backend/Dockerfile`), so a task can hold up to 120 connections ([0045](0045-concurrency-ceilings.md) records the original single-process sizing). Pool-acquire is the natural backpressure when threads exceed pool size. Measured: under a 30-second PostGIS geometry dissolve on `dev`, a single fast probe (`/db_is_alive`) stalled for 63 seconds — event loop fully blocked. The same test on PR #729's branch showed 3–11 ms throughout.
