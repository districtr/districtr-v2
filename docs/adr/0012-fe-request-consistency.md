# 12. Frontend request-consistency pattern for assignment/population queries

Date: 2024-12-31 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Population and district-update queries could get out of sync with the frontend under server load, showing as population bars jumping around, and stale in-flight requests could resolve after a newer one and overwrite fresher state (PR #232).

## Decision

Apply a request-consistency pattern to assignment- and population-heavy frontend queries: abort controllers to cancel superseded in-flight requests, increased debounce on district updates, and a hash of the last district update to eliminate duplicate updates (e.g. a mouse-out firing after painting has already stopped, with no features actually changed).

## Consequences

Population display stays consistent under load instead of jumping around from stale or duplicate responses. This pattern (abort + debounce + dedup) became the standard shape for frontend queries in this class.
