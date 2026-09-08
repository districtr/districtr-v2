# 5. Server memory: the graph LRU cache

Date: 2026-05-06 (PR #540; cap raised by PR #623, 2026-07-15)

## Status

Accepted

## Context

API-server memory climbed to ~7GB in production: the graph cache had no eviction, so one process could hold every state's graph.

## Decision

An LRU cap (`_GRAPH_CACHE_MAX_SIZE`, now in `backend/app/evaluation/graph_loader.py`) plus a debug endpoint for hit/miss stats. The cap started at 10, raised to 15 by PR #623 — too small a cap forces multi-second cold S3 reloads; verify the live value in `graph_loader.py`.

## Consequences

An LRU bounds memory per cache, not per process — the per-worker duplication is what [ADR 9](0009-mmap-shared-graphs.md) addresses.
