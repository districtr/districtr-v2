# 10. Soft delete for DistrictrMap

Date: 2024-11-18 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Ahead of testing, the team needed a way to remove `DistrictrMap` records without deleting rows from the database outright (PR #183, migration `2494caf34886`).

## Decision

Give `DistrictrMap` a visibility flag and use it to soft-delete records instead of deleting rows.

## Consequences

`DistrictrMap` rows persist even after being "deleted" from a user-facing perspective, preserving history and avoiding cascading deletes into related tables. Queries that list or resolve `DistrictrMap` records must filter on the visibility flag to exclude soft-deleted rows.
