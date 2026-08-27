---
name: learn-performance
description: The memory and performance constraints this system has actually hit, and their history — server-process memory footprint, per-worker graph loading, lock contention under load, and where heavy computation is placed (DB vs. server process vs. browser worker). Use when a change could affect memory footprint, request latency under load, or where a computation should run.
user-invocable: false
---

# Performance & Memory

This is a cross-cutting concern with no single owning surface: the constraints below were
each discovered on a different layer (DB locking, per-process memory, browser compute),
and a change on any layer can reintroduce one. There is no dedicated "performance module"
to point at — the territory is the history itself.

## Invariants

- **A district graph is the expensive resource in this system.** Every metric that needs
  adjacency (contiguity, compactness, cut edges, `assigned_units`) loads a full
  block/VTD-level graph for the relevant state. Anything that changes how many copies of
  a graph exist per process, or how many processes exist, multiplies straight through —
  see PR #540 and PR #721 below for the two times this was measured directly.
- **Heavy geometry/tabular computation defaults to a web worker on the frontend, not the
  main thread.** `GeometryWorker` and `ParquetWorker` exist because the map view has to
  stay responsive while assignments, centroids, and parquet-backed demography data are
  processed — see `learn-map-frontend` for the worker contracts themselves; this skill
  holds the *why*.
- **A slow endpoint's first diagnosis question is "where is the O(n) happening," not
  "is the DB slow."** PR #550 below is the concrete instance: a slow endpoint's fix
  wasn't a faster query, it was moving the computation off PostGIS geometry ops and onto
  a graph traversal the server already had cached in memory.

## Server-process memory: the graph cache

**PR #540, "API server memory fix" (merged 2026-05-06).** The API server's memory usage
climbed to ~7GB in production. Root cause: `backend/app/main.py`'s `_get_graph()` cached
every state's dual graph with no eviction — worst case, one process held every state's
graph simultaneously, and the on-disk pickles alone totaled >1GB. Fix: bound the cache to
an LRU of size 10, plus a debug endpoint exposing cache hit/miss stats and memory usage
so the next time this creeps up, it's visible before it's a production incident rather
than after.

An LRU cap bounds memory *per cache*, not per process — it doesn't touch the deeper
problem that each uvicorn worker held its own private cache. That's what PR #721 (below)
addresses.

## Per-worker graph duplication → shared mmap'd graphs

**PR #721, "Replace pickled networkx district graphs with a compact, mmap-shareable
graph class" (opened 2026-08-12, open as of 2026-08-27 — not yet merged; read as the
current direction, not yet the shipped state).** Every uvicorn worker in a container
unpickled its own private copy of every graph it touched — for a large state like
Pennsylvania, ~500MB per worker. `DualLevelDualGraph` replaces the pickled `networkx.Graph`
with a numpy/scipy-backed representation whose arrays are memory-mapped, so every worker
in a container shares one physical copy through the OS page cache instead of holding a
private one.

Measured on Pennsylvania-scale data (346K nodes / 1.08M edges), extrapolated to holding
every US state in memory across 5 workers:

| | Production (`networkx.Graph`) | Current (`DualLevelDualGraph`) |
|---|---|---|
| Per-process resident memory, PA-scale | ~428 MB | 70.3 MB |
| Cross-process sharing | none — each load is a fresh private copy | full — one physical copy via mmap, regardless of worker count |
| Whole-US, 5 workers | 44.7 GB (8.94 GB × 5) | 3.0–3.26 GB, flat regardless of worker count |
| Cold graph load (pickle vs. `.npz`) | 1.3–2.2 s | 0.22–0.26 s |
| Contiguity check, full-state document | 0.16–0.26 s | 0.03–0.04 s (~5–9x) |

An `igraph`-backed alternative was measured and set aside: it beat `networkx` on
per-process memory (~122–132 MB at PA-scale) but its cross-process sharing depends on
`fork()`-based copy-on-write surviving sustained traffic, which degrades in practice —
weaker and less predictable than mmap's guarantee of exactly one physical copy. The PR's
own numbers (155 documents recomputed against production assignment data, checked exactly
against old-code output) are the worked example for how a graph-representation change
gets validated in this codebase — not by trusting the new code, but by running both
implementations against the same real inputs and diffing.

The narrow API this PR introduces (`parents_of`, `children_of`, `cut_edges`,
`expand_non_contiguous`, connectivity via `scipy.sparse.csgraph`) deliberately does not
mirror networkx's dict-like surface — every method exists because a specific call site
needed exactly that operation, not because networkx offered it. This PR also migrated
every runtime reader off the `ParentChildEdges` table onto the graph, which is what makes
that table droppable in a follow-up — see `learn-backend`'s
[references/db-patterns.md](../learn-backend/references/db-patterns.md) for that side of
the story, including the drop attempt that was tried and reverted before this PR existed
to support it.

## Lock contention under load: departitioning

**PR #625 (merged 2026-07-16)** — a stress-test failure (~93% request failure at 12,750
simulated users, with app and DB CPU both idle) traced to `document.assignments` and
`document.community_assignments` being LIST-partitioned per document: every document
creation or reset took an ACCESS EXCLUSIVE lock on the parent table, convoying every
other assignment read/write behind it. The fix — converting both tables to plain tables —
is a DB-locking story, not a memory one, but it's the same genre of failure as the graph
duplication above: a resource (a lock, a private memory copy) that looked cheap per-call
turned out not to be cheap under concurrency. Full detail lives in `learn-backend`'s
[references/db-patterns.md](../learn-backend/references/db-patterns.md).

## Where a computation runs: PostGIS vs. server process vs. browser worker

**PR #550, "Perf: Msgpack and unassigned optimization" (merged 2026-06-10).** The
`GET /document/{id}/unassigned` endpoint was slow because it ran `ST_Union(ST_Envelope(...))`
plus `ST_Transform` across every unassigned geometry in PostGIS — real spatial math, on
every request, over data whose *adjacency* (not exact geometry) is all the caller
actually needed. The fix moved the grouping step to `networkx.connected_components` over
the parent-layer graph the server already had cached in memory, so the SQL side shrank to
enumerating unassigned `geo_id`s with no geometry ops at all; the client then computed
per-component bounding boxes from centroid points it already held, replacing a Turf
`dissolve` over polygons. Same PR also swapped assignment-heavy endpoints from
JSON+Pydantic-validated payloads to msgpack, since the serialization overhead on
thousands of `{geo_id, zone}` rows was itself measurable.

The general lesson this PR is the instance of: a slow endpoint's cost is not always in
the database. Here the database was doing real geometric work it didn't need to; the
cheaper substitute already existed as a cached in-memory structure. Diagnosing "is this
slow because of the query, the serialization, or the computation" before reaching for a
DB-side fix is what separates this fix from a query-tuning pass that wouldn't have found
it.

**PR #470, "Frontend optimizations: faster zone center labels & parquet loading"
(merged 2026-01-29)** is the browser-side counterpart: geometry-worker memory pressure
(duplicate tile-geometry copies held in the worker) and excessive per-tile parquet
requests were both fixed by reducing what got duplicated or re-requested, not by making
either side individually faster. Consistent with the invariant above — heavy geometry
and tabular work already lives in a worker off the main thread; the fix here was reducing
what that worker held, not moving the work elsewhere.

## Query-cost triage: EXPLAIN ANALYZE

When a specific query (not a whole endpoint) is suspected of being slow, the diagnostic
step is `EXPLAIN (ANALYZE, BUFFERS)` run against the query directly on the PostGIS
database — it reports actual row counts and timing per plan node, not just the planner's
estimate, and `BUFFERS` shows whether time is going to disk I/O or CPU. Look for: a
sequential scan where an index was expected, a nested-loop join whose inner side wasn't
estimated to be as large as it turned out to be, or a spatial predicate
(`ST_Intersects`, `ST_Contains`) running before a cheaper non-spatial filter that could
have shrunk the row count first. This skill does not run the query for you — the
containerized DB is a separate access path (see `learn-infra`); use this section as the
method once you have a session against it.

## Territory

- `backend/app/main.py` (`_get_graph`, its LRU cache) and the graph loader/cache layer
  PR #721 introduces (`dual_graph.py`, `graph_loader.py`) — the server-memory story.
- `backend/app/contiguity/*`, `backend/app/evaluation/*`, `backend/app/exports/*`,
  `backend/app/assignments/assignments.py` — every graph-touching call site migrated in
  PR #721.
- `app/src/app/workers/GeometryWorker*`, `ParquetWorker*` — see `learn-map-frontend` for
  the worker contracts; this skill covers why the work is placed there.
- `backend/app/sql/get_unassigned_bboxes_udf*.sql` — the PostGIS path PR #550 moved off
  of; retained (see `learn-backend`'s legacy-UDF handling) but not the live path.

## See also

- `learn-backend` / [references/db-patterns.md](../learn-backend/references/db-patterns.md)
  — the departitioning and `ParentChildEdges` history in full, including migration IDs.
- `learn-map-frontend` — `GeometryWorker`/`ParquetWorker` contracts and what runs on the
  main thread vs. a worker.
- `learn-infra` — how to get a session against the PostGIS database to run the
  `EXPLAIN ANALYZE` triage above.
