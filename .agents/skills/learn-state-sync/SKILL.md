---
name: learn-state-sync
description: Saving and syncing map edits — local IndexedDB persistence, in-memory stores, server sync of assignments and document metadata, optimistic concurrency via updated_at, and conflict resolution. Use when changing how edits are saved, loaded, or synced, or when a change could affect whether an edit survives a reload, a tab switch, or two clients editing the same document.
user-invocable: false
---

# State Sync

## Invariants

- **`updated_at` (server) and `clientLastUpdated` (local) are different clocks and must
  stay distinct.** `updated_at` is the server's timestamp for the document row.
  `clientLastUpdated` is the timestamp of the last write to this browser's IDB copy —
  which happens on every local edit *and* every successful sync. Collapsing the two loses
  the one signal that tells this client apart from the server: whether its own last write
  was a local edit or just a fresh copy of the server's state.
- **A local edit is detected by comparing `clientLastUpdated` to the locally cached
  `document_metadata.updated_at`, not by any dirty flag.** If they're equal, the last
  thing written to IDB was a server sync — the client has no edits since. If they differ,
  something local changed after that sync. This is a derived fact, recomputed from two
  timestamps already being stored for other reasons — there is no separate "dirty" bit to
  fall out of sync with reality.
- **A conflict is declared when the locally cached `updated_at` no longer matches the
  server's current `updated_at`** — i.e. another client (or another tab) saved over the
  version this client last synced against. This is checked independently of whether the
  local client itself has edits; see the load-path walkthrough below for why both cases
  route through the same conflict UI.

## The two timestamps, worked through

Every `StoredDocument` in IDB (`app/src/app/utils/idb/idb.ts`) carries `document_metadata`
(a full copy of the server's document object, including the server's `updated_at` as of
last sync) and `clientLastUpdated` (this browser's own clock). `fetchDocument`
(`app/src/app/utils/api/apiHandlers/fetchDocument.ts`) is where these get compared, on
every document load:

1. Fetch the IDB copy and the server's current metadata in parallel.
2. If the server has no record of the document at all and a local copy exists, fall back
   to the local copy — but only for an implicit load (`source !== 'remote'`); an explicit
   remote fetch (e.g. a Revert action) must surface the failure instead of silently
   returning stale local data as if it were a successful sync.
3. If there's no local copy, or the server is newer on a public page, or the caller
   explicitly asked for `source: 'remote'`: fetch fresh assignments from the server. No
   conflict is possible — there is nothing local to conflict with.
4. Otherwise compare `idbDocument.document_metadata.updated_at` (the server timestamp as
   of last sync) against the server's *current* `updated_at`. If they differ, this is a
   sync conflict — someone else's save landed since this client last touched the
   document. Return `ok: false` with a `SyncConflictInfo` (both documents and both
   timestamps) rather than silently picking a side.
5. If they match, load proceeds from the local copy. `clientLastUpdated ===
   document_metadata.updated_at` decides which side is authoritative for *this* merge —
   a client with no local edits takes the server's incoming fields wholesale; a client
   with local edits keeps its own fields but still layers in `overlays` and `statefps`
   from the server response, since those are never locally editable.

The server's own optimistic-concurrency check (`update_assignments` in
`backend/app/main.py`, `learn-backend`) mirrors step 4 from the other side: the client
sends `last_updated_at`, the server compares it against the current row's `updated_at`,
and responds 409 unless the client also sent `overwrite: true`. The two checks are
independent implementations of the same "did the version I have go stale" question — the
frontend catches the stale case before wasting a round trip; the server catches it
because it's the one source of truth that can't be raced around.

## Conflict resolution

`SyncConflictResolution` (`app/src/app/constants/document/sync.ts`) has four members —
`UseLocal`, `UseServer`, `KeepLocal`, `Fork` — and `assignmentsStore.ts`'s
`resolveConflict` dispatches to one resolver helper per member, each written against a
shared `ConflictDependencies` bundle (`syncConflictInfo`, the store, `setMapDocument`,
`setMapLock`, an optional `onNavigate`). Every resolver runs inside a try/catch in the
dispatcher, so a resolver-level failure (a network error mid-fork, a malformed response)
surfaces through the app's notification system instead of an unhandled rejection.

The same four resolvers serve two different UI entry points, distinguished by a
`ConflictContext` (`'load'` vs `'save'`) each resolver checks internally:

- **Load-path conflict** (`SyncConflictModal`, driven by `useDocumentWithSync`): surfaces
  when `fetchDocument` returns the `ok: false` conflict shape from step 4 above, at
  document-open time.
- **Save-path conflict** (`SaveConflictModal`, driven by `showSaveConflictModal` in
  `mapStore.ts`): surfaces when a save attempt gets the server's 409.

`KeepLocal` in a load context re-ingests the local IDB assignments without touching the
server — the load-time equivalent of "not now." In a save context it's a no-op, since the
local state the user wants to keep is already what's in memory. `UseLocal` re-uploads the
local version with `overwrite: true`, updating `clientLastUpdated` from the server's
response so the two clocks resync. `UseServer` discards local edits and re-ingests the
server's assignments. `Fork` creates a new document (`createMapDocument` with
`copy_from_doc` set to the server document), uploads local assignments there, carries
over local comments (stripped of their old `comment_id`s, since the server mints fresh
ones), and navigates to the new document — the one resolution that keeps both versions,
at the cost of the user now having two documents.

## Territory

- `app/src/app/utils/api/apiHandlers/fetchDocument.ts` — the load-path conflict-detection
  logic worked through above.
- `app/src/app/hooks/useDocumentWithSync.tsx` — the hook that calls `fetchDocument`,
  routes its result into a "no conflict / conflict / error" branch, and renders
  `SyncConflictModal`. Guards against stale-load races when the user switches documents
  mid-fetch (`cancelled` flag).
- `app/src/app/utils/idb/idb.ts` — `StoredDocument` shape, debounced writes
  (`queueAssignmentsUpdate`, 500ms), `flushPendingUpdate` for save-critical/navigation
  moments, and the `beforeunload` handler that best-effort-flushes a pending write before
  the tab closes.
- `app/src/app/store/assignmentsStore.ts` / `coiAssignmentsStore.ts` — `resolveConflict`
  and its four resolver helpers (`resolveKeepLocal`, `resolveUseLocal`, `resolveUseServer`,
  `resolveFork`).
- `app/src/app/store/mapStore.ts` — `showSaveConflictModal`, the save-path conflict flag.
- `app/src/app/components/SyncConflictModal.tsx`, `SaveConflictModal.tsx` — the two UI
  entry points sharing the resolver set.
- `app/src/app/constants/document/sync.ts` — `SyncConflictResolution`, `ConflictContext`.
- `backend/app/main.py` (`update_assignments`) — the server side of the same
  optimistic-concurrency contract; see `learn-backend`.

## See also

- [references/debugging.md](references/debugging.md) — tracing an actual IDB/server
  divergence: what to inspect, which timestamps to compare, how to reproduce each
  resolution path.
- `learn-backend` — the server-side conflict check and the `updated_at` write path.
