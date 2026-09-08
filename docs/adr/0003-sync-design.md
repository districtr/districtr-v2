# 3. Sync design: derived dirtiness, server-owned fields, wholesale comment sync

Date: 2026-09-08 (retrospective record; the decisions predate it and no original date was recorded)

## Status

Accepted

## Context

The edit-sync model (see [`../overview.md`](../overview.md) for the mechanics) needed answers to three recurring questions: how to detect local edits, which fields the client may write, and how incoming comment batches merge with stored ones.

## Decision

- **No dirty flag** — local-edit detection is derived from comparing `updated_at` and `clientLastUpdated`, two timestamps already stored for other reasons, so it cannot fall out of sync with reality.
- **`overlays`/`statefps` are server-owned** — never locally editable; even a local-wins merge layers them in from the server, because local values of fields no UI edits are never information.
- **District-comment sync replaces a zone's comments wholesale** — an incoming batch is not merged with what's stored.

## Consequences

The wholesale comment replacement is a defeasible UX decision, not an invariant. The other two are load-bearing: adding a dirty flag or making server-owned fields locally editable reopens the sync-drift classes these choices closed.
