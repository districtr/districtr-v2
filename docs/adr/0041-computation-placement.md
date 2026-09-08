# 41. Computation placement: graph in process over SQL on the request path

Date: 2026-06-10 (PR #550; browser counterpart #470; extended by #568, #578; recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Several request paths ran heavy PostGIS work per request when the caller needed only topology or already held the inputs. The worst case: `GET /document/{id}/unassigned` ran `ST_Union(ST_Envelope(...))` + `ST_Transform` across every unassigned geometry to answer "which units cluster together."

## Decision

Heavy computation lands where its inputs already live. PR #550 deleted the geometry work from the unassigned path: SQL shrank to enumerating unassigned geo_ids, grouping moved to connected-components over the parent-layer graph the server already caches, and the client computes bounding boxes from centroids it already holds. The same principle then replaced other SQL joins with in-process graph traversal: district healing (PR #568) and export expansion (PR #578). PR #470 is the browser-side counterpart — geometry-worker memory pressure and per-tile parquet re-requests fixed by reducing duplication rather than adding server endpoints.

## Consequences

The cached graph became a load-bearing runtime dependency (its own decision chain: [0015](0015-server-side-contiguity.md) → [0039](0039-pipeline-built-hybrid-graph.md) → [0052](0052-mmap-shared-graphs.md)). The legacy PostGIS path (`get_unassigned_bboxes_udf*.sql`) is retained but not live, per the UDF quarantine ([0017](0017-sqlalchemy-first-no-udfs.md)). Reintroducing per-request geometry SQL on a hot path reverses this decision.
