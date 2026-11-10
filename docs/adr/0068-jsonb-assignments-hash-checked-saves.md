# 68. District assignments stored as one jsonb row; saves are checked by hash

Date: 2026-11-07

## Status

Accepted. Amends [0025](0025-save-sync-model.md) and [0046](0046-assignments-departitioned.md).

## Context

Every save rewrote the whole plan. `PUT /api/assignments` copied every row into a temp table, deleted all of the document's rows, re-inserted them, and diffed a snapshot to find the changed districts. The browser then downloaded the whole plan again to check the save. For a 52k-unit plan that meant 374 ms in the database, 12 MB of WAL, 3.6 MB of dead rows, and a 1.7 MB / 350 ms download, whether one unit or a thousand changed. The rows themselves cost about 148 bytes each, mostly in the `(document_id, geo_id)` index. Measured on local Docker Postgres 15 against a copy of 645 real plans.

## Decision

`document.document_assignments` holds one row per document: `assignments jsonb` as `{geo_id: zone}`, with null for unassigned. `document.assignments` is now a view that expands it to the old `(document_id, geo_id, zone)` rows, so every reader is unchanged: the district_unions rebuild, contiguity, thumbnails, exports, evaluation and `get_assignments`. Only writers target the table.

`PUT /api/assignments` still takes the full plan. It locks the document row for the conflict check, diffs the plan against the stored one, writes only if something changed, and evicts district_unions rows for exactly the districts that changed. Before writing, it checks the parents the save touched against the dual graph and rejects (422, nothing written) a parent saved along with its blocks, a shattered parent missing some of its blocks, or a geo_id the graph doesn't have. Untouched parents aren't checked, so a plan already broken elsewhere can still save, and a missing graph skips the check rather than blocking saves.

The response carries `assignments_hash`: a SHA-256 over the entries sorted by geo_id, each written as `geo_id:zone` and joined by newlines. The browser hashes the plan it sent, and a match confirms the save without a download. A server or browser without hashes falls back to the download check.

Community assignments stay in their own table ([0031](0031-community-assignments-table.md)): a geo_id can belong to several communities, so they don't fit one object.

## Alternatives considered

- **Delta saves**, sending only `{set, remove}` since the last hash-confirmed save. Built and dropped before merge. Postgres rewrites the whole jsonb value on any update, so on a 52k plan the backend took within ~10 ms of a full save. Its shatter check had to ask the database about every block of each touched parent: 16 ms instead of 2 ms at 100 changes, and up to 0.8 s on large edits. It also needed the browser to track the last confirmed plan.
- **Delta upserts into the existing rows.** Fastest writer: about 3 ms for 100 changes at any plan size, with KBs of WAL. The jsonb format was chosen for its ~30× smaller storage, and its saves are still 3–4× faster than before.
- **binary-ensemble (BEN) run-length vectors.** 20–70× smaller than jsonb, but a plan only decodes against a frozen, versioned block order per map, block vectors can't represent shatter state, and Postgres can't read them.
- **Per-row INSTEAD OF triggers on the view**, so old writers keep working: one blob rewrite per inserted row, quadratic for bulk loads.

## Consequences

- Each save rewrites and recompresses the whole blob, so its cost tracks plan size, not change size. On a 52k plan the backend takes about 125 ms (decode, diff, write and hash; the hash is about 50 ms), and the shatter check adds 2–50 ms for 100–10,000 changed units.
- Each save uploads the whole plan: 922 KB of msgpack at 52k units. Browsers don't compress request bodies; gzip would bring it to about 117 KB.
- Each save leaves one dead copy of the compressed blob (about 200 KB at 52k units) for autovacuum.
- Reads through the view expand the jsonb. Whole-plan loads cost the same. Queries that join the view to geometry are on par, but `DISTINCT zone` and LEFT JOINs with the view on the inner side are slower (KS: unassigned units 50 → 92 ms).
- `get_assignments` returns rows in jsonb key order, not insertion order; it never promised an order.

## Revisit when

Save latency or upload size on large plans matters again: gzip the request body (`CompressionStream`), maintain an order-independent hash incrementally instead of rehashing the plan, or bring back delta saves.
