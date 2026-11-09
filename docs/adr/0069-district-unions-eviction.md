# 69. district_unions rows are evicted after two weeks

Date: 2026-11-09

## Status

Accepted. Amends [0024](0024-district-unions-cache.md) and [0067](0067-nightly-district-stats-refresh.md).

## Context

`document.district_unions` ([0024](0024-district-unions-cache.md)) kept a unioned geometry per district for every plan ever viewed, indefinitely. Most plans are never opened again, and a published plan's public readers are served the S3 copy ([0047](0047-stats-cdn-offload.md)), not the table.

## Decision

After its publishes, the nightly pass ([0067](0067-nightly-district-stats-refresh.md)) calls `evict_old_district_unions` (`app/stats_refresh.py`), under the same advisory lock. It deletes every row of each plan whose newest row and `assignments_updated_at` are both older than 14 days, in batches of plans so no statement nears the statement timeout. Eviction is per plan, never per district: thumbnails read the table as-is and would draw a partly evicted plan with districts missing.

The S3 copy and thumbnail are untouched. Rows carry their build time, not their last read, so a plan that is read but never edited is evicted and rebuilt every two weeks.

## Consequences

The first edit-mode `/stats` read, export or evaluation of a plan idle for two weeks rebuilds every district, as for a plan never viewed. Public reads of a published plan still redirect to the CDN. The pass runs only where S3 is configured, so other environments never evict. Deleted rows free space for reuse inside the table; the file shrinks only with `VACUUM FULL` or `pg_repack`.

0067 says to move the nightly work to a scheduled task ([0044](0044-graph-integrity-check.md)) when a second job wants the in-process pattern. This one is a few DELETEs inside the existing pass, so it did not trigger the move.
