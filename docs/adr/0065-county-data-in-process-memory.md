# 65. County data held in process memory

Date: 2026-10-01 (PR #773)

## Status

Accepted. Supersedes [0037](0037-county-demographics-cache.md). Amends [0036](0036-eguia-state-ideal-cache.md).

## Context

The county-splits and Eguia metrics need each parent layer's counties: their populations, and per election which party won each county. These were stored in `evaluation.county_demographics` (one JSON row per county per gerrydb table, written on first request and never refreshed, [0037](0037-county-demographics-cache.md)), with a copy in each backend process on top. Adding an election column to an onboarded layer, the case PR #773 adds tooling for, left both copies stale, and refreshing them meant upserts from request threads in several processes, serialized by an advisory lock.

## Decision

`CountyContext` aggregates a parent layer with one read-only `GROUP BY` query on first request (22–92 ms for the seven v2 VTD layers measured locally) and keeps the county populations and the Eguia ideals in process memory. An Eguia key the loaded ideals lack reloads that layer, so a newly added election appears without a restart. The table held only derived data, so it is dropped (migration `55d7b369ed57`); the downgrade recreates it empty.

## Consequences

Memory is bounded at about 2 MB per process: roughly 3,220 counties × two layer versions per state × about 40 numeric columns × 8 bytes, against about 2.6 GB per backend process. On the seven local layers the in-memory populations and ideals equal those computed from the table. A correction to the values of an existing column shows only after a backend restart.
