# Web Workers

`GeometryWorker` and `ParquetWorker` contracts: what runs off the main thread, why, and
the guarantees each worker's API makes to its callers. Verified against the codebase as
of 2026-08-27.

## Table of contents

- [Why workers exist here](#why-workers-exist-here)
- [Access pattern (Comlink)](#access-pattern-comlink)
- [GeometryWorker](#geometryworker)
- [ParquetWorker](#parquetworker)
- [Common failure modes](#common-failure-modes)

## Why workers exist here

Two kinds of work are too slow to run inline in a paint gesture or a React render:
GEOS-derived geometry operations (dissolve, centroid/median-point, unassigned-area
computation) and parquet range-scans over demography/point data. Both live in
dedicated Web Workers so `mousemove`-driven paint interaction and `mapRenderSubs`
color passes stay responsive. PR #550 (Jun 2026, "Perf: Msgpack and unassigned
optimization") reworked `geometryWorker.ts`'s unassigned-geometry path together with
backend msgpack payload encoding specifically to keep this boundary fast as document
size grew — evidence that the worker boundary, not the render path, is where this
class of optimization belongs.

## Access pattern (Comlink)

Both workers follow the same shape:

```ts
// index.ts
const worker = typeof Worker !== 'undefined'
  ? new Worker(new URL('./geometryWorker.ts', import.meta.url))
  : null;
const GeometryWorker = worker ? wrap<GeometryWorkerClass>(worker) : null;
export default GeometryWorker;
```

- `wrap<T>()` (Comlink) turns the worker into a proxy typed by its `*.types.ts`
  contract; every method call becomes an async message round-trip.
- The `typeof Worker !== 'undefined'` guard makes the export `null` outside a browser
  (SSR). Every caller must treat the worker as nullable — `GeometryWorker?.updateZones(...)`
  is the pattern used throughout `mapRenderSubs.ts`.
- The type contract (`geometryWorker.types.ts`, `parquetWorker.types.ts`) is the
  source of truth for the worker's shape; it must change in the same commit as the
  worker implementation, since Comlink gives no compile-time check that the
  implementation still matches it.

## GeometryWorker

Holds an in-memory geometry cache keyed by feature `path` (`geometries`,
`activeGeometries`), plus `pointData`/`childPointData` for centroid calculations and a
`cachedCentroids` cache. Representative surface:

- `updateZones(entries)` — pushes `[geoid, zone]` pairs into the worker's own zone
  index; called from `mapRenderSubs.ts` on every color-render pass to keep the worker
  in sync with the store, independent of feature-state.
- `handleShatterHeal({parents, children})` — updates the worker's view of which IDs are
  currently shattered.
- `getMedianPoint` / `getCentroidsFromView` — compute label-placement centroids for
  features within the current viewport, using `pointData` (parent-layer centroids) or
  `childPointData` (shattered children — kept separate so unassigned-area lookups can
  resolve children absent from the parent point set).
- `getUnassignedGeometries(documentId?, exclude_ids?)` — dissolves and returns
  unassigned geometry, used to zoom-to-unassigned; this is the code path PR #550
  optimized.
- `setPublicFeatures(features)` — loads center-of-mass points from public district
  polygons for the public (non-editing) view.
- `clear()` / `resetZones()` — explicit cache lifecycle resets; must be called on map
  document/source change, or stale geometry from the previous document leaks into
  centroid/unassigned computations for the new one.

## ParquetWorker

Serves demography and point-selection data from parquet files via range reads,
avoiding full-file fetches:

- `getMetaData(url, enablePrefetch?)` — fetches and caches (`_metaCache`) parquet
  metadata plus an enhanced buffer with multi-range prefetch support; repeat calls for
  the same URL resolve instantly from cache.
- `getRowGroupsFromParentValue` / `getRowGroupsFromChildValue` — use parquet row-group
  statistics to skip irrelevant row groups rather than scanning the whole file for a
  given parent/child geo_id.
- `getByteRangesForRowGroups` / `prefetchByteRanges` — compute and prefetch the byte
  ranges needed for a selection ahead of the actual read.
- `getRowRange(url, range, columns?)` — the actual selective row/column read.
- `getDemography(mapDocument, brokenIds?)` — the main entry point consumed by the
  demography store; resolves columns and results as `ColumnarTableData`, using
  `brokenIds` (shattered children) to route parent vs. child rows correctly.
- `getPointData` / `generateGeojsonFromPointData` — point-selection data (used for
  label placement and click-to-select), with optional `filterIds` narrowing.

`_idRgCache` caches row-group lookups per parent/child value across calls — like the
geometry cache, this needs to stay correct as map documents change; it is not
explicitly reset by a `clear()` method the way `GeometryWorker` is, so a document
switch relies on the cache keys (which include the value being looked up) rather than
an explicit wipe.

## Common failure modes

- Stale geometry cache after a map source change (missing `clear()`/`resetZones()`
  call).
- Parquet reads over-fetching data from a wrong row/column range computation.
- Worker method called before the `typeof Worker !== 'undefined'` guard is satisfied
  (SSR/non-browser access) — always optional-chain worker calls.
- Silent type drift between a worker's actual return shape and what `*.types.ts`
  declares, since Comlink does not enforce the contract at the call site.
