# 67. District stats publish nightly for idle plans, not on every save

Date: 2026-11-06 (PR #830)

## Status

Accepted. Amends [0047](0047-stats-cdn-offload.md). Amended by [0069](0069-district-unions-eviction.md).

## Context

Under 0047, every zone-changing `PUT /api/assignments` and every import or copy (`POST /api/create_document`) queued `publish_district_stats_to_s3`: a union rebuild, a thumbnail, and an S3 upload. On 2026-11-06 `/stats` and `/evaluation` took 35–100 s across about 25 states' plans on the 2-vCPU database, while a teacher reported that a class, each student drafting a different state's House plan, could not export. An export saves first, so it waits on the per-plan stats lock ([0064](0064-advisory-lock-single-flight.md)) behind the publish that save queued.

## Decision

Saves and imports no longer publish. They keep per-district cache eviction, so viewing, exporting or evaluating a plan still rebuilds only the changed districts, on demand.

Each backend process starts a daemon thread (`app/stats_refresh.py`) at startup when S3 is configured. At 08:00 UTC (3 am Eastern, midnight Pacific) every thread races for one session-level advisory lock, held on its own connection as in 0064. The winner selects the plans that are stale, have had no saves for an hour, and changed within the last two days and an hour. It publishes them one at a time, evenly spaced across three hours, and stops at four hours. Just before each publish it re-checks that the plan is still stale and idle, since its slot can come hours after selection. A failure is logged by `public_id` and skipped; the plan stays stale and is retried the next night. The run's summary is logged at ERROR, so it reaches Sentry, when any plan failed or the run ran out of time. `python cli.py refresh-stale-stats` runs a pass by hand under the same lock.

No queue table, scheduler or separate task: staleness (`stats_published_at < assignments_updated_at`) is the queue, and the lookback window both bounds the backfill and lets one missed night catch up.

Two publishers still run during the day, on purpose. A public `/stats` read of a stale plan publishes in the background, including the read that follows the editor's switch to Display or Evaluate, so shared links reach the CDN without waiting for the night. A submission publishes its frozen clone, so the gallery shows it at once.

## Alternatives considered

- **EventBridge Scheduler launching a one-off Fargate task that runs a `cli.py` command**, as the graph check does ([0044](0044-graph-integrity-check.md)). This was rejected for now: the requester asked for the work to stay inside FastAPI, and this shipped as a hotfix to `main` with no infra change. The CLI command makes moving to that pattern a scheduling change only.
- **An hourly queue table drained by a scheduled ECS task.** Drafted first. It needs a migration and infra for what timestamps already record.
- **Only remove the save-path publish.** Public `/stats` reads would still publish shared plans. But a plan nobody opens publicly would keep a stale thumbnail in My Maps and the gallery indefinitely, so this was rejected.

## Consequences

A plan's CDN copy and thumbnail lag its last save until the next night, or until a public viewer's `/stats` read publishes it. The first public viewer after an edit pays the rebuild of the changed districts inline. The nightly pass runs inside a web process, so its one-at-a-time rebuilds share that process's CPU with requests, and its lock holds one pooled connection for the run. A deploy, or an autoscaling scale-in that stops the winning task, abandons the run. The next night picks up the remaining plans, but only within the lookback window.

## Revisit when

A normal night regularly logs plans left over at the four-hour stop, runs are often abandoned, or a second nightly job wants the same in-process pattern (then move both to the 0044 pattern).
