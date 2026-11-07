---
name: map-edit-sync
description: Changing how map edits are saved, loaded, or synced — local IndexedDB persistence, server sync of assignments and document metadata, optimistic concurrency, and sync-conflict resolution.
user-invocable: false
---

# Map Edit Sync

## Vocabulary at this surface

- **`updated_at` and `clientLastUpdated` are different clocks, not near-synonyms.** `updated_at` is the server's timestamp on the document row; `clientLastUpdated` is the browser's own clock, stamped on every write to this browser's IDB copy (local edits *and* successful syncs). Comparing them **is** the local-edit signal — equal means the last IDB write was a server sync (no local edits since); different means something local changed. There is deliberately no dirty flag: the signal is derived from two timestamps already stored for other reasons, so it cannot fall out of sync with reality.
- **A save overtaken by an edit stays dirty.** The sidebar stays live during a save, so `putUpdateAssignmentsAndVerify` checks two stamps: the store's `clientLastUpdated` against its value when the caller read the state, and IDB's own `clientLastUpdated` against its value when the save started (`idb.updateDocumentIfUnchanged` checks and writes in one Dexie transaction, and on a mismatch only advances the stored `updated_at`). If either moved, the map adopts the server's `updated_at`, re-stamps IDB as a local edit and returns `superseded: true`; callers must not mark it clean. If the user left the map mid-save, only that map's IDB copy records the result.
- **A delta save needs a hash-confirmed base.** `putUpdateAssignmentsAndVerify` sends `assignments_delta` only when its last save was confirmed by `assignments_hash` and that save's `updated_at` is still the document's; anything else (first save, `overwrite`, a mismatch, no hash) sends the full plan. The hash spec is shared by `hashAssignments` (frontend) and `assignments_count_and_hash` (backend) — change both or neither ([ADR 0068](../../docs/adr/0068-jsonb-assignments-delta-saves.md)).

## Where the rest lives

- The `fetchDocument` load/merge walkthrough, conflict-resolution model, and server-owned metadata fields: `docs/overview.md`.
- Tracing an actual IDB/server divergence: [references/debugging.md](references/debugging.md).
