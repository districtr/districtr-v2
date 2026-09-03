---
name: performance-memory
description: Investigating a slow endpoint or high memory, or making a change that could affect backend memory usage, request latency, or where a heavy computation runs (database, server process, or browser worker).
user-invocable: false
---

# Performance & Memory

## Constraints

- **A district graph is the expensive resource in this system.** Every metric that
  needs adjacency (contiguity, compactness, cut edges, `assigned_units`) loads a full
  block/VTD-level graph for the relevant state. Anything that changes how many copies
  of a graph exist per process, or how many processes exist, multiplies memory straight
  through. Backend task sizing (`backendMemory` in `infra/config.ts`) and the graph LRU
  cache (`_GRAPH_CACHE_MAX_SIZE`, `backend/app/evaluation/graph_loader.py`) are coupled —
  check both before resizing either.

## Where the rest lives

The incident history behind this constraint — the ~7GB cache-growth fix (PR #540), the
mmap-shared graph direction (PR #721), the assignments departitioning under lock convoy
(PR #625), and the computation-placement fixes (PR #550, #470) — is in
`docs/decisions.md`, each entry dated and PR-anchored.
