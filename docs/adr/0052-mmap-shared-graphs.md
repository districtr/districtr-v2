# 52. Graphs memory-mapped and shared across workers

Date: 2026-08-28 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

District graphs (block/VTD adjacency, used by contiguity checks and every district-quality metric) were pickled `networkx.Graph` objects, unpickled fresh in every uvicorn worker — one full private copy per worker, around 500MB for a large state like Pennsylvania (PR #721).

## Decision

Replace the pickled `networkx.Graph` with `DualLevelGraph`, a numpy/scipy-backed representation whose arrays are memory-mapped, so every worker in a container shares one physical copy through the OS page cache instead of holding a private copy. The class exposes a narrow, explicit API (`parents_of`, `children_of`, `cut_edges`, `expand_non_contiguous`, connectivity via `scipy.sparse.csgraph`) rather than mirroring networkx's dict-like surface — every method exists because a call site needs exactly that operation. Every graph-touching call site (contiguity, validity, compactness, assignments, exports, and the two remaining `parentchildedges`-backed reads in `main.py`) migrated onto this API; the class and its I/O/caching layer (S3 resolution, shared disk cache, per-process LRU) split into two files, `dual_graph.py` (pure data structure) and `graph_loader.py` (orchestration).

## Alternatives considered

- `igraph`, a compiled-C graph library. Measured on Pennsylvania-scale data (346K nodes / 1.08M edges): ~122–132 MB per-process resident memory, versus `networkx`'s ~428 MB and `DualLevelGraph`'s 70.3 MB. Cross-process sharing is partial at best — the C-layer topology can survive `fork()`-based copy-on-write sharing only under narrow conditions (a common pre-forked parent, every worker staying up for the process's whole lifetime), and degrades under sustained traffic. Set aside in favor of the numpy/scipy design, which shares more reliably.

## Consequences

Per-process resident memory drops from ~428MB to 70.3MB at Pennsylvania scale, and the mmap'd arrays (42.2MB of that 70.3MB) are shared as one physical copy across any number of workers — though roughly 28MB/graph remains private Python-object overhead per process, so sharing is not total. Across all 52 states at realistic LRU capacity (15 graphs, ADR 0035), memory still grows with worker count, unlike a naive "flat total" framing would suggest — but far more slowly than the prior `networkx` design's per-worker private-copy multiplier. The `parentchildedges` table's three remaining SQL-joined call sites in `main.py` were migrated to read from the graph instead; the table itself was left in place for a separate follow-up once this change has run in production.
