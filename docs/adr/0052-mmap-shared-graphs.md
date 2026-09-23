# 52. Graphs memory-mapped and shared across workers

Date: 2026-08-28 (recorded retrospectively 2026-09-08; detail expanded 2026-09-22 from Dylan's write-up)

## Status

Accepted

## Context

District graphs (block/VTD adjacency, used by contiguity checks and every district-quality metric) were pickled `networkx.Graph` objects, unpickled fresh in every uvicorn worker — one full private copy per worker, around 500MB for a large state like Pennsylvania (PR #721).

## Decision

Replace the pickled `networkx.Graph` with `DualLevelGraph`, a numpy/scipy-backed representation whose arrays are memory-mapped, so every worker in a container shares one physical copy through the OS page cache instead of holding a private copy. The class exposes a narrow, explicit API (`parents_of`, `children_of`, `cut_edges`, `expand_non_contiguous`, connectivity via `scipy.sparse.csgraph`) rather than mirroring networkx's dict-like surface — every method exists because a call site needs exactly that operation. Every graph-touching call site (contiguity, validity, compactness, assignments, exports, and the two remaining `parentchildedges`-backed reads in `main.py`) migrated onto this API; the class and its I/O/caching layer (S3 resolution, shared disk cache, per-process LRU) split into two files, `dual_graph.py` (pure data structure) and `graph_loader.py` (orchestration).

Four key changes:

1. Swap from pickled NetworkX graphs to numpy arrays for storage.
2. Swap from NetworkX to scipy for runtime graph functions.
3. Utilize mmap (memory map) to allow shared memory space between workers.
4. Bump up to 2 workers on each backend container.

**Data model.** The heavier `networkx.Graph` contained a set of nodes with parent, children, weighted_edges and other attributes. networkx in general bakes in a lot of functionality, and stores everything as nested Python dicts, so every node and edge carries object overhead. This was stripped down to numpy arrays sorted by ID with a separate `parent_of` array, plus a CSR adjacency built from the edges, stored as npz. For two VTDs where A is shattered into blocks A1 and A2:

```
node_ids     ['blk:A1', 'blk:A2', 'vtd:A', 'vtd:B']
edges        [[0, 1], [1, 3], [2, 3]]       # A1-A2, A2-B, A-B
parent_of    [2, 2, -1, -1]                 # A1 and A2 belong to vtd:A, -1 = no parent
adj          [1, 3, 0, 3, 1, 2]             # neighbors grouped by source node
adj_offsets  [0, 1, 3, 4, 6]                # node i's neighbors are adj[off[i]:off[i+1]]
```

Same information as the previous pickles, at ~5-10x less memory.

**Runtime.** Contiguity runs `scipy.sparse.csgraph.connected_components` over the sparse adjacency, in compiled code instead of NetworkX's pure-Python BFS. Technically, the runtime lookup complexity has increased (O(1) dict lookup to O(log N) binary search), which sounds bad, but it is batched and log2 of 350K nodes is only ~18 comparisons. Every hot path resolves all its IDs in one vectorized `searchsorted` call instead of one Python call per ID, and the cut-edges loop then works entirely on integer indices without touching a string until the end. Net result is contiguity checks are 5 to 9x faster than before, not slower.

**Memory sharing.** The first load pulls the .npz file from S3 and caches it on the ECS container as one raw .npy file per array (under `GRAPH_CACHE_PATH`, in /tmp), then reloads those files via numpy with `mmap_mode="r"` (read only). Instead of copying the file into the worker's own memory, the kernel maps the file directly into the worker's address space. The actual bytes live in the kernel's page cache, which is shared across all processes on the container, so when the second worker mmaps the same files it gets pointed at the same physical memory. Zero copy, one copy of each graph no matter how many workers. Read only matters here because a write would give that worker a private copy of the page and silently break the sharing, so the graph object is immutable.

**Cache protocol.** Each graph's cache directory has a simple meta.json that marks it as complete and records the format version. The writer builds into a temp dir and atomically renames it into place, so if a worker sees meta.json it knows every array file next to it is good to go. If two workers race to build the same graph, the second rename fails and both just use the winner's files. The per-process LRU (15 graphs, ADR 0035) is still there in front of all this, so the flow is LRU, then disk cache, then S3. The cache lives as long as the container: a redeploy starts empty and rebuilds from S3 on first request.

**Graph construction stays on networkx.** Only the runtime representation changes. The pipeline still builds each graph as a `networkx.Graph` and converts it to arrays when it writes the npz. Rewriting the build directly on arrays is costly: the current logic is well verified, and every contiguity check and metric depends on its correctness. The networkx build is also easier to read: add the block edges, then annotate parents and add the parent level on top. Keeping this step-by-step construction in the pipeline also lets `DualLevelGraph` stay immutable, with no mutable build API.

## Alternatives considered

- `igraph`, a compiled-C graph library. Measured on Pennsylvania-scale data (346K nodes / 1.08M edges): ~122–132 MB per-process resident memory, versus `networkx`'s ~428 MB and `DualLevelGraph`'s 70.3 MB. Cross-process sharing is partial at best — the C-layer topology can survive `fork()`-based copy-on-write sharing only under narrow conditions (a common pre-forked parent, every worker staying up for the process's whole lifetime), and degrades under sustained traffic. Set aside in favor of the numpy/scipy design, which shares more reliably.

## Consequences

Per-process resident memory drops from ~428MB to 70.3MB at Pennsylvania scale, and the mmap'd arrays (42.2MB of that 70.3MB) are shared as one physical copy across any number of workers — though roughly 28MB/graph remains private Python-object overhead per process, so sharing is not total. Across all 52 states at realistic LRU capacity (15 graphs, ADR 0035), memory still grows with worker count, unlike a naive "flat total" framing would suggest — but far more slowly than the prior `networkx` design's per-worker private-copy multiplier. That headroom is what funds the bump to 2 workers per backend container. A lot of runtime code and SQL cruft from doing parent-child things in-database was deprecated — an approach that never matched optimized in-memory graphs on performance: the `parentchildedges` table is still written at onboarding but nothing reads it anymore, and a migration dropped the dead shatter UDFs; dropping the table itself is a separate follow-up once this change has run in production.
