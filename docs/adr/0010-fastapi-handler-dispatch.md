# 10. FastAPI handler dispatch: `def` vs `async def`

Date: 2026-09 (PR #729)

## Status

Accepted

## Context

FastAPI routes declared with `def` are automatically dispatched to anyio's threadpool; routes declared with `async def` run directly on the event loop. Before this PR, three graph handlers (`get_unassigned_geoids`, `check_document_contiguity`, `get_connected_component_bboxes`) were `async def` only because they called `await run_in_threadpool(get_graph, ...)`. That pattern is not qualitatively different from a plain `def` handler calling `get_graph(...)` directly — both dispatch blocking work to the same threadpool. The `async def` + `run_in_threadpool` wrapper added no concurrency benefit and obscured why the handler existed.

## Decision

Convert those three to `def`. The Turnstile session handlers stay `async def` because they genuinely `await` an `httpx` coroutine — real non-blocking I/O that belongs on the event loop. That distinction is the invariant: `async def` only when the handler has a real awaitable (network I/O via an async library); `def` for everything else. The rule has a second half: an awaitable justifies `async def`, but the whole body then runs on the event loop, so any blocking segment inside such a handler must itself be wrapped in `run_in_threadpool`. That is the wrapper's surviving role — bridging blocking portions of genuinely-async handlers, not wrapping a handler's entire body.

**Endpoints that are legitimately `async def`** (as of this PR):

| Endpoint | Awaitable |
|---|---|
| `POST /session` | `verify_session_turnstile` — httpx Turnstile call |
| `PUT /api/assignments` | `request.body()` — streaming raw msgpack body |
| `POST /api/commenter`, `/comment`, `/tag`, `/submit-comment` | `turnstile.verify_turnstile` — httpx Turnstile call |

Each of these wraps its blocking work (sync SQLAlchemy writes, msgpack decode + assignment ingest) in `run_in_threadpool`; only the awaitable itself runs on the event loop. All other route handlers are `def`. Non-route `async def` (middleware, lifespan, exception handlers) are required to be async by FastAPI/Starlette's own API and are not in scope of this rule.

## Consequences

Concurrency parameters: anyio threadpool sized to 80 in lifespan (`anyio.to_thread.current_default_thread_limiter().total_tokens = 80`); DB pool is 40 base + 20 overflow = 60 connections per task. Pool-acquire is the natural backpressure when threads exceed pool size. Measured: under a 30-second PostGIS geometry dissolve on `dev`, a single fast probe (`/db_is_alive`) stalled for 63 seconds — event loop fully blocked. The same test on this branch showed 3–11 ms throughout.
