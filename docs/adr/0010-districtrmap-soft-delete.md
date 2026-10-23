# 10. Soft delete for DistrictrMap

Date: 2024-11-18 (recorded retrospectively 2026-09-08)

## Status

Accepted. Amended by [0056](0056-cms-schema-ownership.md).

## Context

Ahead of testing, the team needed a way to remove `DistrictrMap` records without deleting rows from the database outright (PR #183, migration `2494caf34886`).

## Decision

Give `DistrictrMap` a visibility flag and use it to soft-delete records instead of deleting rows.

## Consequences

`DistrictrMap` rows persist even after being "deleted" from a user-facing perspective, preserving history and avoiding cascading deletes into related tables. Only the map listing (`GET /api/gerrydb/views`) filters on the visibility flag. Looking up a document's map by its slug must not filter on it, so hiding a map never breaks documents already created on it (see the comment on `visible` in `backend/app/models.py`).
