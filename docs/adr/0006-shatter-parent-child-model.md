# 6. Two-level parent/child model for shattering

Date: 2024-10-16 (recorded retrospectively 2026-09-08)

## Status

Accepted. Amended by [0052](0052-mmap-shared-graphs.md).

## Context

Districtr needed to let users paint at a coarse geography (e.g. VTD) while occasionally working at finer detail (e.g. block) inside a single unit — "shattering" — without redesigning the whole editing model (PR #84, closing #13). The initial UX also had to support re-entering shatter mode, remembering which units were already shattered across page reloads, and handling paint interactions that cross a shattered boundary (PR #129).

## Decision

Model shattering as two geography levels: a coarse, paintable parent layer and a fine child layer (the `parent_layer` and `child_layer` foreign keys on `DistrictrMap`), linked by a `ParentChildEdges` table that records the intersection between a gerrydb parent view and its child view. On shatter, child rows are fully populated for the shattered parent; assignments join through `ParentChildEdges` so a page reload can reconstruct which parents are shattered.

## Consequences

Editing above and below the base geography works through the same relational model, with parent/child linkage as explicit table data rather than ad hoc client logic. The two-level model and full child-row population survive (`_heal_or_fill` still inserts a shattered parent's missing siblings). What changed is the source of the parent-to-child lookup: PR #721 moved every reader onto the pipeline-built graph ([0039](0039-pipeline-built-hybrid-graph.md), [0052](0052-mmap-shared-graphs.md)), and PR #770 then dropped the `ParentChildEdges` table.
