# Debugging a sync conflict

How to trace an actual IDB/server divergence in this app: what to inspect, which timestamps to compare, and how to replay each resolution path deliberately. Read this when a user reports lost edits, a stuck conflict modal, or "my map reverted."

## Contents

- [Inspecting IDB state](#inspecting-idb-state)
- [Reading the three timestamps](#reading-the-three-timestamps)
- [Reproducing a conflict deliberately](#reproducing-a-conflict-deliberately)
- [Replaying each resolution path](#replaying-each-resolution-path)
- [Reading a stuck-modal report](#reading-a-stuck-modal-report)

## Inspecting IDB state

The app's IDB database is `DocumentsDB` (Dexie, `app/src/app/utils/idb/idb.ts`), with a `documents` table keyed by `id` (the document's UUID). In the browser's DevTools → Application → IndexedDB → `DocumentsDB` → `documents`, each row is a `StoredDocument`:

```
{
  id: string,                    // document UUID — the IDB key
  document_metadata: {...},      // full server document object as of last sync,
                                  // including its own `updated_at`
  assignments: Assignment[],     // this client's current geo_id → zone rows
  clientLastUpdated: string,     // ISO timestamp — see below
  password?: string | null,
  shouldFetchAssignments?: boolean,
}
```

`assignments` here is the *client's* view — it may be ahead of, behind, or diverged from whatever `GET /api/document/{id}/assignments` returns from the server. Comparing the two directly (IDB row's `assignments` vs. a fresh server fetch) is the fastest way to see whether a reported "lost edits" bug is a real data loss or a rendering issue downstream of correctly-synced data.

## Reading the three timestamps

Three timestamps matter, and confusing any two of them is the most common cause of a misdiagnosed sync bug:

1. **`document_metadata.updated_at`** — the server's timestamp for this document, as of the last time this client successfully synced. This is a snapshot, not a live value.
2. **`clientLastUpdated`** — when this client last wrote to its own IDB row, whether from a local edit or from re-syncing with the server. Compare this to (1): equal means no local edits since last sync; different means local edits are pending.
3. **The server's live `updated_at`** — fetch `GET /api/document/{id}` to get this. Compare it to (1): equal means no one else has saved since this client's last sync; different means a conflict exists on next load (`fetchDocument`'s step 4).

A stale-data report almost always resolves to: which of these three is the reporter actually looking at, and which one do they think they're looking at.

## Reproducing a conflict deliberately

To trigger the load-path conflict UI (`SyncConflictModal`) on purpose:

1. Open a document, make an edit, let it save (or manually flush — see below).
2. In a second tab/session (or via a direct `PUT /api/document/{id}/assignments` with `overwrite: true`), save a *different* change to the same document. This advances the server's `updated_at` without touching the first tab's IDB copy.
3. In the first tab, force a re-load of the document (navigate away and back, or reload the page). `fetchDocument` will find `document_metadata.updated_at` (still the old value) doesn't match the server's current `updated_at`, and return the conflict shape.

To trigger the save-path conflict (`SaveConflictModal`) instead: make the edit in the first tab but don't let it save yet (or use IDB's debounce — see below to force an immediate flush point), let the second save land, then trigger the first tab's save.

## Forcing an immediate IDB write

Writes are debounced 500ms (`DocumentsDB.DEBOUNCE_DELAY`) by default — rapid paint strokes coalesce into one write instead of one per stroke. For debugging, call `idb.flushPendingUpdate()` from the console (or set a breakpoint on it) to force the pending write through immediately rather than waiting out the debounce window. This is also the function to check first if a report says an edit was lost on a fast navigation-away: `flushPendingUpdate` runs on `beforeunload`, but only best-effort (it can't `await` inside that handler), so a very fast close can in principle race it.

## Replaying each resolution path

With a conflict reproduced (above), each `SyncConflictResolution` member exercises a different code path in `assignmentsStore.ts` — worth stepping through directly when a report names a specific resolution ("I picked keep local and lost my edits anyway"):

- **`KeepLocal`**: `resolveKeepLocal` — check that `loadLocalAssignments` is reading the IDB row *before* any subsequent write in the same tick could have overwritten it.
- **`UseLocal`**: `resolveUseLocal` — the local assignments get re-uploaded with `overwrite: true`; check the server actually returns a fresh `updated_at` in its response and that `store.setClientLastUpdated` is called with it. A stale `clientLastUpdated` after this path is the top suspect for a report of "the conflict came right back."
- **`UseServer`**: `resolveUseServer` — check `getAssignments` is called against `syncConflictInfo.serverDocument`, not the stale document object the tab loaded with.
- **`Fork`**: `resolveFork` — check `createMapDocument`'s response is `ok` before anything ingests; a failed fork here should be visible as a thrown `DocumentCreationError`, not a silent no-op.

Every resolver runs inside `resolveConflict`'s try/catch, so a resolver throwing should surface via the notification system — if a report describes a resolution silently doing nothing, check whether the corresponding resolver actually threw and the notification was missed, versus the resolver genuinely no-op'd.

## Reading a stuck-modal report

`showSaveConflictModal` (save path) and the `conflictInfo`/`showConflictModal` pair (load path, inside `useDocumentWithSync`) are the two flags that gate modal visibility. A modal that won't close after a resolution usually means one of these flags wasn't cleared — `resolveConflict` clears `showSaveConflictModal` unconditionally at its start (before dispatching to a resolver), so a modal stuck open after clicking a resolution button points at the load path's `onComplete` callback not firing, not at the shared dispatcher.
