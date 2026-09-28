# 34. Evaluation metrics as versioned JSON payload

Date: 2026-04-29 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Persisted evaluation metrics for documents were being introduced, but the metric set was expected to evolve quickly, with anticipated future user customization of metric options (different enabled metrics, formulas, and output shapes). A rigid schema with one database column per metric would require frequent migrations and would optimize for querying/ranking by metric values, which is not a product goal — the team wanted to deliberately avoid making metric-based global filtering/ranking easy by default (PR #536, migration `aa7a1c749ac0`).

## Decision

Store metrics in a JSON payload (`metrics` JSONB) with a `payload_version` stamp derived from a registry manifest, rather than creating one relational column per metric. Treat the payload as an application-level contract managed by code versioning and cache invalidation rules.

## Alternatives considered

- Fixed relational columns per metric. Rejected — every metric add/remove/shape change would require a schema migration and tighter coupling between product iteration and database evolution.
- EAV/long-form metric rows (`metric_key`, `metric_value`). Rejected — still encourages ad hoc ranking/filtering, increases query complexity, and does not materially improve rapid shape evolution for nested or structured metric outputs.

## Consequences

Fast iteration on available metrics and user-customizable metric configurations, with fewer schema migrations. Explicit invalidation via `payload_version` when metric definitions change. Flexibility preserved for complex or nested metric outputs. Trade-off: weaker direct SQL ergonomics for analytics and no first-class indexed columns for metric-based ranking/filtering — an intentional product constraint. Any future need for searchable metrics should be introduced explicitly via curated derived fields or materialized views, not by widening the core table schema.

## Revisit when

High-volume cross-document ranking/filtering on metric values is required, strict BI/reporting requirements demand stable typed columns, or performance constraints indicate payload extraction is a bottleneck.
