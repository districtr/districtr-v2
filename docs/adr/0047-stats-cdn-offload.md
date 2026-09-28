# 47. /stats offloaded to S3/CDN with staleness timestamps

Date: 2026-07-17 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

A follow-up stress-test run (run3) still showed 92% → 42% failure rate after prior fixes. Remaining causes: RDS CPU saturation from `/stats` recomputing on every viewer request, a cold-cache unique-violation race under concurrent load, and correctness gaps in the `district_unions` cache lifecycle — the whole document's cache was evicted on any change, and reset left the cache and CDN permanently stale (PR #551, migration `a30db9686b7c`).

## Decision

Redirect public `/stats` reads to S3 when fresh (`stats_published_at ≥ assignments_updated_at`, tracked via two new timestamp columns on `document.document`), with a background task publishing on first viewer miss. `PUT /assignments` and `POST /api/create_document` enqueue publishing as a background task so the CDN is warm before the first viewer arrives post-save. Move `district_unions` eviction to per-district (dirty-tracking) granularity — only districts whose membership changed on save are recomputed and evicted, rather than the whole document's cache — with the unassigned row recomputed only when a district it touches is rebuilt.

## Consequences

RDS is no longer on the hot path for repeat public `/stats` reads. A thundering-herd guard collapses concurrent publish tasks to one actual S3 PUT by checking freshness at entry and returning immediately if already fresh, and `ON CONFLICT DO NOTHING` plus re-select prevents unique-violation 500s when concurrent requests race to populate a cold cache. `stats_published_at` is stamped with the `assignments_updated_at` snapshot taken before the rebuild, not `NOW()`, so a save that lands mid-publish cannot mark a stale object as fresh. `reset_map` now deletes `district_unions` rows and bumps `assignments_updated_at`, closing the gap where reset previously left the cache and CDN permanently stale.
