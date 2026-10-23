# 25. Save/sync model: IndexedDB drafts, automated server sync, derived dirtiness

Date: 2025-12-19 (PR #464; chain #267 → #287, #127 → #468, #601; recorded retrospectively 2026-09-08)

## Status

Accepted.

## Context

The first sync era paired frequent autosaves with a checkout/locking system, and produced persistent bugs around tab switching, lost work, and status checking; PR #464's own assessment was that the event frequency suited a WebSocket architecture the platform didn't have, while multi-user editing was at best an edge case. Local persistence had its own churn: an IndexedDB read-cache (PR #267) was removed once DB indexing made it unnecessary (PR #287), and the localStorage route PR #267 rejected had a projected ~66-plan ceiling. Request races had been attacked once before at the request level: PR #232 (2024-12-31) added abort controllers that cancelled superseded assignment and population requests, a longer debounce, and a hash to skip duplicate updates; PRs #268 and #283 removed both abort controllers within ten weeks, and only the hash survives (`dataUpdateHash` in the chart store). Single-flight sync removes the race by never having two requests in flight.

## Decision

Three durable pieces, arrived at across the chain:

- **IndexedDB continuously autosaves the local draft** (PR #468 migrated persistence from localStorage; the local copy is always current).
- **Server sync is automated at safety points, not continuous**: PR #464 removed continuous server autosave in favor of an explicit save; PR #601 then automated that same explicit save path at tab-hide, window unfocus, and 30 seconds of inactivity — single-flight, so simultaneous triggers cannot race a stale `last_updated_at`. Close-time saves are best-effort; an interrupted final save remains pending locally.
- **Local-edit detection is derived, not flagged**: comparing `updated_at` (server clock) with `clientLastUpdated` (browser clock) — two timestamps stored for other reasons — so dirtiness cannot fall out of sync with reality.
- **`overlays` and `statefps` are server-owned**: never locally editable, and even a local-wins merge layers them in from the server, because no UI edits them locally, so the local copy's values are never information.

## Consequences

The server remains the source of truth under optimistic concurrency (`updated_at` conflict detection); IndexedDB is a draft cache, not a sync layer. The checkout/locking system is gone. Work survives a crash between safety points in the local draft, and the derived-dirtiness rule is the reason no separate dirty flag exists to maintain.
