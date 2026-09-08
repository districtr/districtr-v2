# 6. Computation placement

Date: 2026-06-10 (PR #550; browser-side counterpart PR #470, merged 2026-01-29)

## Status

Accepted

## Context

`GET /document/{id}/unassigned` ran `ST_Union(ST_Envelope(...))` + `ST_Transform` across every unassigned geometry in PostGIS on every request, when the caller only needed which units cluster together.

## Decision

Delete the geometry work: grouping moved to `networkx.connected_components` over the parent-layer graph the server already had cached, SQL shrank to enumerating unassigned `geo_id`s, and the client computed bboxes from centroids it already held. The same PR swapped assignment-heavy endpoints from JSON+Pydantic to msgpack. PR #470 is the browser-side counterpart: geometry-worker memory pressure and per-tile parquet requests fixed by reducing duplication and re-requests.

## Consequences

Heavy computation lands where its inputs already live (server-cached graph, client-held centroids) rather than in per-request PostGIS geometry work. The legacy PostGIS path (`get_unassigned_bboxes_udf*.sql`) is retained but not live.
