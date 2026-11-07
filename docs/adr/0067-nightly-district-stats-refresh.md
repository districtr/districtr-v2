# 67. District stats publish nightly for idle plans, not on every save

Date: 2026-11-06

## Status

Accepted. Amends [0047](0047-stats-cdn-offload.md).

## Context

Under 0047, every zone-changing `PUT /api/assignments` and every import or copy (`POST /api/create_document`) queued `publish_district_stats_to_s3`: a union rebuild, a thumbnail, and an S3 upload. On 2026-11-06 `/stats` and `/evaluation` took 35–100 s across about 25 states' plans on the 2-vCPU database, while a teacher reported that a class, each student drafting a different state's House plan, could not export. An export saves first, so it waits on the per-plan stats lock ([0064](0064-advisory-lock-single-flight.md)) behind the publish that save queued.

## Decision

Saves and imports no longer publish. They keep per-district cache eviction, so viewing, exporting or evaluating a plan still rebuilds only the changed districts, on demand.

Each backend process starts a daemon thread (`app/stats_refresh.py`) at startup when S3 is configured. At 08:00 UTC (3 am Eastern, midnight Pacific) every thread races for one session-level advisory lock; the winner selects the plans that are stale, have had no saves for an hour, and changed within the last two days. It publishes them one at a time, evenly spaced across three hours, and stops at four hours. A failure is logged and skipped. The plan stays stale and is retried the next night.

No queue table, scheduler or separate task: staleness (`stats_published_at < assignments_updated_at`) is the queue, and the two-day window both bounds the backfill and lets a missed night catch up.

## Consequences

A plan's CDN copy and thumbnail lag its last save until the next night, or until a public viewer's `/stats` read publishes it. The nightly pass runs inside a web process, so its one-at-a-time rebuilds share that process's CPU with requests. A deploy during the window abandons the run, and the next night picks up the remaining plans.
