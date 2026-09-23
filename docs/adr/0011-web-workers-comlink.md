# 11. Heavy geometry/tabular work in Web Workers via Comlink

Date: 2024-12-23 (PR #210; anchor found by code archaeology — the PR body does not describe the worker; recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Rendering district numbers and outlines on the map requires dissolving rendered features by district assignment — expensive work that would block the main thread if run there (PR #210). Later, partial reads of long-format parquet tabular data needed the same treatment (PR #334; see also ADR 0020).

## Decision

Move heavy geometry and tabular computation into Web Workers (`GeometryWorker`, later `ParquetWorker`) accessed via Comlink, rather than running that work on the main thread.

## Consequences

The main thread stays responsive during dissolve, label-placement, and parquet-read work. Worker-based computation became the standard place for CPU-heavy client-side work, extended later to parquet parsing on a worker thread using Hyparquet.
