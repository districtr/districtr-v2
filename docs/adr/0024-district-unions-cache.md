# 24. district_unions: precomputed per-district cache table

Date: 2025-09-05 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Generating thumbnails and, eventually, public views needed unioned district geometries and demographic aggregates, but computing these on demand from raw assignments was expensive and would need to run repeatedly for every consumer (PR #446).

## Decision

Add a `district_unions` table in the document schema that stores precomputed unioned `MultiPolygon` geometry per district plus a JSONB `demographic_data` column, generated when a document marked "ready to share" is unlocked. `update_or_select_district_unions` fetches an existing row or triggers regeneration if missing or outdated. Demographic aggregation dynamically discovers numeric columns on the associated gerrydb table via `information_schema` and aggregates with `SUM()`, joined on the `path` field between district assignments and demographic tables.

## Alternatives considered

- A materialized view instead of a table. Rejected — the workflow needs per-document staleness logic (e.g. skip regeneration if the map has not changed since the last union), which a materialized view's refresh semantics do not support without comparable added complexity.
- Per-map-module or per-document dedicated columns instead of JSONB. Rejected — each gerrydb view has a dynamic column set (e.g. varying election-data columns), so a flexible JSONB column follows the existing precedent of the `document` schema rather than inventing per-map schemas.

## Consequences

Thumbnail generation runs against already-unioned geometry instead of recomputing unions per request. This became the standing per-district cache — later given per-district dirty tracking and CDN offload for `/stats` (ADR 0047) and cross-referenced by public-view serving (ADR 0032).
