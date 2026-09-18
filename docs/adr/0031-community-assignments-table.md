# 31. Community mode: separate community_assignments table

Date: 2026-03-23 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Community mode (PR #515) needed to record community-of-interest assignments distinct from district plan assignments, without conflating the two (migration `112a59ed50a2`).

## Decision

Store community assignments in a separate `community_assignments` table, parallel to the district-plan `assignments` table. Its `zone` column carries the `community_id`, with `0` reserved as the unassigned sentinel.

## Consequences

Community and district-plan assignment data stay in separate tables with independent lifecycles, at the cost of parallel schema and query logic between the two tables — later work (ADR 0046) departitioned both tables together.
