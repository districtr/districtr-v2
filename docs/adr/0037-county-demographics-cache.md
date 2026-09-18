# 37. County demographics materialized in DB, keyed by GerryDB table name

Date: 2026-05-13 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Several metrics (Eguia, and forced county splits) require demographic data aggregated to county level. GerryDB stores data at VTD/block-group/block granularity — aggregating up to county on every request means grouping thousands of rows by a substring of their path, expensive enough to block the API response path (PR #538, migration `b4e2f8a91c30`).

## Decision

Materialize county-level aggregates into an `evaluation.county_demographics` table on first use, keyed by `(geoid, gerrydb_table_name)`. Subsequent requests check for an existing row with a non-null `total_pop` before re-populating; the table is written once per gerrydb table and never updated.

On the key choice — gerrydb table name over state FIPS: state FIPS was the initial candidate, but two problems ruled it out. Most `DistrictrMap` rows do not store `statefps` — the field exists primarily for the Navajo Nation, which spans counties in multiple states and cannot be identified by a single FIPS code. More practically, GerryDB table names are versioned by convention (`_v1` → `_v2`) whenever source geographies are updated, so using the table name as the cache key means a data refresh automatically produces a new cache entry with no explicit invalidation — old rows simply become orphaned under the previous name. A FIPS-keyed cache would silently serve stale aggregates after a GerryDB update because the key would not change. The Navajo Nation multi-state edge case was noted but was not the primary driver: evaluation metrics are not meaningful for non-political districting projects like Navajo Nation, and a per-module evaluation toggle is planned to handle those cases going forward.

## Alternatives considered

- State FIPS key. Ruled out — most maps don't store it, doesn't survive GerryDB version bumps, and fails for multi-state regions.
- Recompute from GerryDB on every request. Ruled out — the `GROUP BY` over thousands of VTD/block rows is too slow for a synchronous API endpoint.
- In-memory cache, analogous to `StateIdealCache` (ADR 0036). Rejected — county demographics are larger (one JSONB blob per county per state), and the in-memory approach doesn't survive restarts or scale across workers.
- PostgreSQL materialized view over GerryDB. Cleaner in principle, but requires tight schema coupling to the GerryDB tables and a manual `REFRESH` trigger; the application-level cache gives the same result with less infrastructure dependency.

## Consequences

County demographics are populated lazily on the first Eguia request for a given state, adding latency to that one cold request; subsequent requests are fast. Keying by table name means cache entries are naturally versioned — deploying a new GerryDB table creates a fresh entry, and the old one becomes an orphan with no automatic cleanup.

## Revisit when

Orphaned rows under old table names grow large enough to matter, or the team decides to use Redis for a dedicated cache framework.
