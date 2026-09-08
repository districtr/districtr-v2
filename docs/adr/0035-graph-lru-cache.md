# 35. Graph LRU cache in the API process

Date: 2026-05-06 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

The API server's memory usage kept growing to about 7GB because `_get_graph()` cached the dual graph per state with no eviction, retaining every state's graph — up to a total of over 1GB of pickle data — in the worst case (PR #540). A later stress-test run (`run1`, PR #623) found the fleet touching around 11 distinct maps against an LRU size of 10, forcing evictions into multi-second cold S3 reloads.

## Decision

Cache the loaded dual graph in an LRU of bounded size, evicting least-recently-used graphs instead of retaining every graph ever loaded. Expose a debug endpoint (`/_debug/cache`) showing cache hit/miss stats and memory usage. The cap was raised from 10 to 15 after stress-test evidence (PR #623) showed 10 was too tight for observed working-set size.

## Consequences

API server memory usage is bounded by cache size rather than growing unboundedly with the number of distinct states touched. The cap is a tuning knob traded against S3 reload latency on eviction; PR #623 documents 15 as the current measured-appropriate value for observed traffic. See ADR 0052 (mmap-shared graphs) for the later change to what is held per cache slot, distinct from how many slots this ADR governs.
