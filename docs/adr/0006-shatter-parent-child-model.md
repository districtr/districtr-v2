# 6. Two-level parent/child model for shattering

Date: 2024-10-16 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Districtr needed to let users paint at a coarse geography (e.g. VTD) while occasionally working at finer detail (e.g. block) inside a single unit — "shattering" — without redesigning the whole editing model (PR #84, closing #13). The initial UX also had to support re-entering shatter mode, remembering which units were already shattered across page reloads, and handling paint interactions that cross a shattered boundary (PR #129).

## Decision

Model shattering as two geography levels: a coarse, paintable parent layer (`DistrictrMap`) and a fine child layer, linked by a `ParentChildEdges` table that records the intersection between a gerrydb parent view and its child view. On shatter, child rows are fully populated for the shattered parent; assignments join through `ParentChildEdges` so a page reload can reconstruct which parents are shattered.

## Consequences

Editing above and below the base geography works through the same relational model, with parent/child linkage as explicit table data rather than ad hoc client logic. This mechanism was later superseded by graph-served children (see the pipeline-built hybrid graph, ADR 0039) — the `ParentChildEdges` table and full child-row population described here belong to that earlier design and are not the current mechanism.
