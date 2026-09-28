# 38. Backend reliability policy: DB timeouts, slow-request logging, self-owned background sessions

Date: 2026-05-28 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

The API server occasionally had long-hanging requests that blocked other requests from creating new database connections, with no timeout to bound them and no logging to diagnose them afterward (PR #543). Separately, after a couple of days of normal activity the API degraded badly — query times climbed from hundreds of milliseconds to minutes, then requests started failing with a `QueuePool` timeout. The primary cause was per-request temp tables (`temp_assignments_{uuid}`) created with the Postgres default `ON COMMIT PRESERVE ROWS`, so they lived for the life of the pooled connection and bloated `pg_class`/`pg_attribute` over days, slowing query planning. A secondary cause was background tasks (thumbnail generation, comment moderation) reusing the request-scoped DB session, which `get_session()` closes at request teardown, leaking a connection each time (PR #545).

## Decision

Add statement/lock timeouts to backend DB requests and log long-running requests for diagnosis. Create per-request temp tables with `ON COMMIT DROP` so they drop when their transaction ends, covering both commit and error paths. Background tasks must own their own DB session rather than reuse the request-scoped session that gets closed at request teardown.

## Consequences

Hanging requests are now bounded and visible in logs rather than able to starve the connection pool indefinitely. Temp-table catalog bloat from long-lived sessions is eliminated at the source. The self-owning-session pattern for background tasks (already used correctly by `moderate_comment_by_id`) became the standard for all background work touching the database.
