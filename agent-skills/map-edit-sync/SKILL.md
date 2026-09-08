---
name: map-edit-sync
description: Changing how map edits are saved, loaded, or synced — local IndexedDB persistence, server sync of assignments and document metadata, optimistic concurrency, and sync-conflict resolution.
user-invocable: false
---

# Map Edit Sync

## Vocabulary at this surface

- **`updated_at` and `clientLastUpdated` are different clocks, not near-synonyms.** `updated_at` is the server's timestamp on the document row; `clientLastUpdated` is the browser's own clock, stamped on every write to this browser's IDB copy (local edits *and* successful syncs). Comparing them **is** the local-edit signal — equal means the last IDB write was a server sync (no local edits since); different means something local changed. There is deliberately no dirty flag: the signal is derived from two timestamps already stored for other reasons, so it cannot fall out of sync with reality.

## Where the rest lives

- The `fetchDocument` load/merge walkthrough, conflict-resolution model, and server-owned metadata fields: `docs/overview.md`.
- Tracing an actual IDB/server divergence: [references/debugging.md](references/debugging.md).
