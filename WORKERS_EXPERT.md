# WORKERS_EXPERT

## Purpose
Define worker boundaries, Comlink contracts, cache behavior, and performance guardrails for geometry and parquet processing.

## When To Use
- You are changing `GeometryWorker` or `ParquetWorker` interfaces/logic.
- You are moving computation across main-thread and worker boundaries.
- You are modifying tabular/centroid/dissolve/parquet behavior.

## Canonical Files
- `app/src/app/utils/GeometryWorker/index.ts`
- `app/src/app/utils/GeometryWorker/geometryWorker.ts`
- `app/src/app/utils/GeometryWorker/geometryWorker.types.ts`
- `app/src/app/utils/ParquetWorker/index.ts`
- `app/src/app/utils/ParquetWorker/parquetWorker.ts`
- `app/src/app/utils/ParquetWorker/parquetWorker.types.ts`
- `app/src/app/utils/ParquetWorker/parquetWorkerUtils.ts`

## Hard Invariants
- Worker APIs are contract-based; update `*.types.ts` with implementation changes.
- Main thread must treat workers as asynchronous and nullable (SSR/browser guard).
- Geometry worker caches (`geometries`, `activeGeometries`, centroid caches) require explicit lifecycle resets.
- Parquet worker metadata/range caching must preserve correctness under changing map docs.
- Heavy geospatial or parquet scanning should remain in workers, not in React render/event loops.

## Preferred Patterns
- Extend existing worker methods instead of adding ad hoc duplicate pathways.
- Use range-aware parquet reads and selective columns to minimize network/CPU.
- Reset caches on map document/source changes.
- Keep payloads serializable and compact.

## Anti-Patterns
- Passing non-serializable structures through Comlink unexpectedly.
- Forgetting to clear cache when switching tiles/parquet sources.
- Moving expensive worker code back to the main thread.
- Hidden changes to worker return shapes without type updates.

## Change Checklist
1. Update worker types and implementation together.
2. Validate browser-only initialization guards still hold.
3. Validate cache reset behavior for map/document switches.
4. Validate downstream store/render consumers for contract changes.
5. Validate performance with large datasets.

## Validation Commands
- `cd app && bun run build`
- Manual checks: map switch, shatter cycle, demography loading, centroid rendering.

## Common Failure Modes
- Stale geometry cache after map source change.
- Parquet reads over-fetching data due to row/column range mistakes.
- Worker null access in non-browser contexts.
- Silent type drift between worker result and store expectations.
