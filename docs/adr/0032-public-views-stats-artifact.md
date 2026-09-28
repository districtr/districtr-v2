# 32. Public views read the published stats artifact

Date: 2026-04-12 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Public (read-only) views were loading map data the same way the editor does, which meant heavier database load for assignments on complex plans and heavier client load for map and demographic data than a read-only view needs (PR #452).

## Decision

Public views turn off editing features and load from `GET /api/document/{id}/stats` — a pre-generated GeoJSON of unioned districts and their stats — instead of the editor's raw-assignments path. The demography service, choropleth mapping, and geometry worker were adapted to also ingest this stats shape for public views, and county filters load from the stats endpoint.

## Consequences

Public/read-only traffic no longer drives the same database and client load as editing. This is distinct from where the stats artifact is served from — see ADR 0047, which moved `/stats` itself onto CDN/S3 with per-district cache eviction; ADR 0032 is what a public view reads, ADR 0047 is where it comes from.
