# 39. Single hybrid dual-level graph, built by the pipeline

Date: 2026-06-10 (recorded retrospectively 2026-09-08)

## Status

Accepted.

## Context

Contiguity and evaluation metrics had relied on separate parent-level and child-level dual graphs, which complicated storage, testing, and computation. Graph generation had also lived in backend ingestion, requiring database access during what should be a pipeline concern (PR #541).

## Decision

Replace the separate parent- and child-level graphs with a single combined hybrid-level graph — block nodes, parent nodes, cross-level edges, and weighted edge counts. Build this graph entirely in the pipeline from GeoPackage spatial joins (no database access), upload it to S3, and have the backend download it on demand. The backend never builds graphs itself.

## Consequences

Graph structure is simpler to store, test, and compute against, and graph generation has no runtime dependency on the database. This is the graph format the LRU cache ([0035](0035-graph-lru-cache.md)) loads and the later mmap-shared representation ([0052](0052-mmap-shared-graphs.md)) replaces internally. The shatter path kept joining `parentchildedges_*` to expand parents after this PR; PR #721 moved every reader onto this graph ([0052](0052-mmap-shared-graphs.md)), and PR #770 dropped the table ([0006](0006-shatter-parent-child-model.md)).
