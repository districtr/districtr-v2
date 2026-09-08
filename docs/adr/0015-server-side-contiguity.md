# 15. Server-side contiguity via pickled graphs cached in the API process

Date: 2025-03-05 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Contiguity checking needs adjacency-graph traversal over block/VTD assignments, which is not a natural fit for PostGIS geometry operations at interactive latency (PR #282, fixing #97). Profiling showed that persisting the loaded graph in memory saved roughly 500ms to a second on a cache hit.

## Decision

Store adjacency graphs as compressed pickles (or GMLs) on S3, load them into the API process, and persist the loaded graph in memory rather than recomputing contiguity in PostGIS. Frontend then consumes a contiguity endpoint built on this in-process graph. A follow-up (PR #294) added an endpoint returning bounding boxes of contiguous connected components per district, refactoring the block-assignment UDFs it depends on to use efficient join conditions.

## Alternatives considered

- Compute contiguity via PostGIS geometry operations. Not pursued as the primary mechanism — graph traversal over adjacency is the natural operation, not a spatial join.

## Consequences

Contiguity checks run in-process against a cached graph, achieving roughly 1–1.5s on a cache miss and under 500ms on a cache hit. This established graph-in-process as the standing pattern for contiguity and related computation, later generalized into the LRU-cached graph store (ADR 0035) and the pipeline-built hybrid graph (ADR 0039).
