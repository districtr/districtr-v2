# 9. Graphs become mmap-shared

Date: 2026-08-28 (PR #721)

## Status

Accepted

## Context

Every uvicorn worker unpickled its own private copy of every district graph it touched (~500MB per worker for Pennsylvania-scale data). The LRU cap of [ADR 5](0005-graph-lru-cache.md) bounds memory per cache, not per process, so multi-worker containers still multiplied the footprint.

## Decision

`DualLevelDualGraph` replaces the pickled `networkx.Graph` with a numpy/scipy representation whose arrays are memory-mapped, so all workers in a container share one physical copy. An `igraph` alternative was measured and set aside — its sharing depends on `fork()` copy-on-write surviving sustained traffic, weaker than mmap's guarantee.

## Consequences

Measured at PA-scale (346K nodes / 1.08M edges): per-process resident memory 428MB → 70MB; whole-US across 5 workers 44.7GB → ~3GB flat; cold load 1.3–2.2s → ~0.25s; contiguity check ~5–9x faster. Validation method worth copying: both implementations run against 152 sampled production documents and diffed.

The PR also migrated every runtime reader off the `ParentChildEdges` table, and its migration (`2ecf1bdc582b`) dropped the dependent UDFs (`shatter_parent`, `unshatter_parent`, the `get_block_assignments` overloads) as dead code — interactive shattering is applied client-side from graph children served by `GET /api/gerrydb/edges/`. The table itself survives write-only: onboarding still populates it, nothing reads it, and dropping it is the remaining follow-up.

**The drop that was tried too early**: on 2026-07-17 a commit removed `ParentChildEdges`, its CLI commands, and the dependent UDFs outright; it was reverted on 2026-08-06 before reaching `dev` — the graph subsystem it depended on hadn't landed yet. With #721 merged that dependency is gone; `ParentChildEdges` stays partitioned (LIST by `districtr_map`) but write-only, awaiting the table drop.
