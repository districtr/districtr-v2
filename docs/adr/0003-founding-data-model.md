# 3. Founding data model

Date: 2024-07-24 – 2024-09-11 (PRs #5, #27, #83; recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

The platform needed a relational core for user work: a plan, and the assignment of geographic units to districts within it.

## Decision

A `Document` row per plan (UUID-keyed, in a dedicated `document` schema, PR #27) and an `Assignments` table mapping `geo_id` to a district per document (PR #5). A NULL district assignment means "unassigned" — introduced with the eraser (PR #83), and load-bearing ever since: unassigned detection, the unassigned-totals row in the stats cache, and the shattered-children contract all key on it.

## Consequences

Every subsequent storage decision (partitioning and its reversal, [0046](0046-assignments-departitioned.md); the community-mode table, [0031](0031-community-assignments-table.md)) is a variation on this core. The document UUID later became the edit capability itself ([0022](0022-share-model-public-ids.md)).
