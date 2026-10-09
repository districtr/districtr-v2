# 36. In-memory singleton cache for Eguia state ideals

Date: 2026-05-13 (recorded retrospectively 2026-09-08)

## Status

Accepted.

## Context

Eguia's fairness score compares a plan's seat outcomes against a "state ideal": each party's population-weighted share of counties carried per election, that is, the seat share that would emerge if districts were drawn at county granularity. Computing it demands aggregating county-level election results and population for the entire state. This query is expensive, and the result changes only when underlying census data changes, not per-plan-submission (PR #538).

## Decision

Store computed state ideals in a process-level singleton (`IdealsForEguia`, today the `ideals_for_eguia` method on the `COUNTY_CONTEXT` singleton in `backend/app/evaluation/context.py`), keyed by GerryDB table name, populated lazily on first request and retained for the server lifetime.

## Alternatives considered

- Persist in the database alongside `county_demographics`. Rejected — would add another table with little efficiency gain.
- Recompute on every request. Rejected — too slow; the aggregation touches all county rows for a state.

## Consequences

Eguia score requests avoid repeated state-wide aggregation after the first request for a given GerryDB table. Being process-local memory, a server restart flushes the cache and values recompute on next request; keying by GerryDB table name (rather than state FIPS) is shared with [0037](0037-county-demographics-cache.md)'s `county_demographics` cache — see that record for why table name was chosen as the key.
