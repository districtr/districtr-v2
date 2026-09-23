# 20. Tabular demographics as long-format ZSTD parquet on CDN

Date: 2025-04-28 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Serving tabular demographic and election data out of Postgres put read load on the database for data that is fundamentally static per gerrydb table and does not need relational querying (PR #334, migration `d38d0f766dc5`).

## Decision

Output tabular data from the pipeline as long-format Parquet files (columns: `path`/geoid, `column_name`, `value`), ZSTD-compressed (default level 12), with key-value metadata (`column_list`, `length_list`) describing available columns and per-parent-geography row ranges. The browser partially reads these files over range requests using Hyparquet on a Web Worker thread, then pivots the data to wide format client-side, since queries and derived columns are faster against a wide shape. Postgres is out of the demographic-read path.

## Alternatives considered

- Serve tabular data wide from the start. Rejected — long format supports partial reads far better, and compresses more efficiently for transfer; the pivot to wide happens client-side instead.

## Consequences

Demographic reads no longer load the database at all; they are CDN-served range reads. Key-value metadata can get large for big states (around 300kb for Texas) but remains acceptable. This established Parquet-on-CDN, partially read by a worker, as the standard shape for tabular data — see also ADR 0011 (Web Workers).
