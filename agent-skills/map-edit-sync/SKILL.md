---
name: map-edit-sync
description: Changing how map edits are saved, loaded, or synced — local IndexedDB persistence, server sync of assignments and document metadata, optimistic concurrency, and sync-conflict resolution.
user-invocable: false
---

# Map Edit Sync

## Vocabulary at this surface

- **`updated_at` and `clientLastUpdated` are different clocks, not near-synonyms.** `updated_at` is the server's timestamp on the document row; `clientLastUpdated` is the browser's own clock, stamped on every write to this browser's IDB copy (local edits *and* successful syncs). Comparing them **is** the local-edit signal — equal means the last IDB write was a server sync (no local edits since); different means something local changed. There is deliberately no dirty flag: the signal is derived from two timestamps already stored for other reasons, so it cannot fall out of sync with reality.
- **A save overtaken by an edit stays dirty.** The sidebar stays live during a save, so `putUpdateAssignmentsAndVerify` compares `clientLastUpdated` with its value when the save read its state. If an edit landed meanwhile, it adopts the server's `updated_at`, re-stamps IDB as a local edit and returns `superseded: true`, and callers must not mark the map clean. If the user left the map mid-save, only that map's IDB copy records the result.

## Where the rest lives

- The `fetchDocument` load/merge walkthrough, conflict-resolution model, and server-owned metadata fields: `docs/overview.md`.
- Tracing an actual IDB/server divergence: [references/debugging.md](references/debugging.md).
