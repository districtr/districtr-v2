# Architecture Decision Records

Why the system is shaped the way it is, one record per decision, in [Nygard format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions). Each record is PR-anchored where possible so its claims can be re-verified. Companion to [`../overview.md`](../overview.md) (the what); these records are the why.

To add a decision: copy the section structure of any record here into the next-numbered `NNNN-slug.md`, and add a line below. A decision that reverses an earlier one gets a new record and marks the old one Superseded.

| ADR | Title | Date |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | 2026-09-08 |
| [0002](0002-cms-publishing-two-columns.md) | CMS publishing: two columns, no status enum | 2025-04-08 |
| [0003](0003-sync-design.md) | Sync design: derived dirtiness, server-owned fields, wholesale comment sync | 2025-12 – 2026-02 |
| [0004](0004-map-layer-separation.md) | Map layer components separated | 2026-02 |
| [0005](0005-graph-lru-cache.md) | Server memory: the graph LRU cache | 2026-05-06 |
| [0006](0006-computation-placement.md) | Computation placement | 2026-06-10 |
| [0007](0007-assignments-departitioned.md) | Assignments tables departitioned | 2026-07-16 |
| [0008](0008-undo-redo-per-gesture.md) | Undo/redo per gesture | 2026-07 |
| [0009](0009-mmap-shared-graphs.md) | Graphs become mmap-shared | 2026-08-28 |
| [0010](0010-fastapi-handler-dispatch.md) | FastAPI handler dispatch: `def` vs `async def` | 2026-09 |
