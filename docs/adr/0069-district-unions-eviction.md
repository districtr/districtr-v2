# 69. district_unions rows are evicted after two weeks

Date: 2026-11-09 (PR #836)

## Status

Accepted. Amends [0024](0024-district-unions-cache.md) and [0067](0067-nightly-district-stats-refresh.md).

## Context

`document.district_unions` ([0024](0024-district-unions-cache.md)) kept a unioned geometry per district for every plan ever viewed, indefinitely. Most plans are never opened again, and a published plan's public readers are served the S3 copy ([0047](0047-stats-cdn-offload.md)), not the table.

## Decision

After its publishes, the nightly pass ([0067](0067-nightly-district-stats-refresh.md)) calls `evict_old_district_unions` (`app/stats_refresh.py`), under the same advisory lock. It deletes every row of each plan whose newest row and `assignments_updated_at` are both older than 14 days, oldest plans first, in batches of plans so no statement nears the statement timeout. A run stops once it has deleted about `DISTRICT_UNIONS_EVICT_GB_PER_NIGHT` (default 30) of stored geometry, and setting that to 0 turns eviction off. Each deleted byte writes about a byte of write-ahead log, and when this shipped about 100 GB was already past the 14 days with under 50 GB of disk free, so the cap spreads that backlog over several nights. Eviction is per plan, never per district: thumbnails read the table as-is and would draw a partly evicted plan with districts missing.

A cache-hit read in `update_or_select_district_stats` bumps the rows' `updated_at` when it is more than a day old, so `updated_at` means last built or read and a plan people still open in the editor or export is kept. The bump writes `district_unions` only, never `document.updated_at`, which save-conflict checks compare.

The S3 copy and thumbnail are untouched.

## Consequences

The first edit-mode `/stats` read, export or evaluation recompute of a plan nobody has read from the table for two weeks rebuilds every district, as for a plan never viewed. Public reads of a published plan redirect to the CDN and do not count as reads here. A cache-hit read now writes, at most once per plan per day. The nightly thread starts only where S3 is configured, so other environments evict only when someone runs `python cli.py refresh-stale-stats`, which runs the same pass with or without S3. Deleted rows free space for reuse inside the table; the file shrinks only with `VACUUM FULL` or `pg_repack`.

0067 says to move the nightly work to a scheduled task ([0044](0044-graph-integrity-check.md)) when a second job wants the in-process pattern. This one is a few DELETEs inside the existing pass, so it did not trigger the move. The eviction logs its own rows, megabytes and seconds, and a failure turns the pass's summary line into an ERROR.
