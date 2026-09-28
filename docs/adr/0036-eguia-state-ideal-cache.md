# 36. In-memory singleton cache for Eguia state ideals

Date: 2026-05-13 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Eguia's fairness score requires a "state ideal" — the proportional population each district should represent — which demands aggregating county-level demographics for the entire state. This query is expensive, and the result changes only when underlying census data changes, not per-plan-submission (PR #538).

## Decision

Store computed state ideals in a process-level singleton (`StateIdealCache`), keyed by GerryDB table name, populated lazily on first request and retained for the server lifetime.

## Alternatives considered

- Persist in the database alongside `county_demographics`. Rejected — would add another table with little efficiency gain.
- Recompute on every request. Rejected — too slow; the aggregation touches all county rows for a state.

## Consequences

Eguia score requests avoid repeated state-wide aggregation after the first request for a given GerryDB table. Being process-local memory, a server restart flushes the cache and values recompute on next request; keying by GerryDB table name (rather than state FIPS) is shared with ADR 0037's `county_demographics` cache — see that record for why table name was chosen as the key.
