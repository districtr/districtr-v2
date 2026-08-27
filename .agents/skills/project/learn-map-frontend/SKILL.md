---
name: learn-map-frontend
description: How the interactive map renders and responds to user input — Zustand store architecture, the subscription/middleware wiring that turns store changes into MapLibre paint and feature-state updates, shatter/heal transitions, and which work is pushed into Web Workers. Use when a change could affect what the map shows, how painting/shattering feels, or how map-related state is organized or synchronized across stores.
user-invocable: false
---

# Map Frontend

The interactive map is a Zustand-store-driven render target: user gestures write to
stores, subscribers translate store state into MapLibre `setFeatureState`/paint calls,
and heavy geometry or tabular work is pushed off the main thread so painting keeps
feeling synchronous. This skill covers that whole loop — the four surfaces that always
co-fire together (page/store composition, runtime interaction, layer/style, workers)
express one concern: *how the map renders and responds*.

## Grounded invariants

- **State is store-driven, not component-local.** Cross-store side effects only work if
  each store is the single source of truth for its slice; ad hoc component state can't
  be seen by the subscription layer that drives the map.
- **Cross-store side effects wire through `subscriptions.tsx` / `mapEditSubs.ts` /
  `metricsSubs.ts`, not scattered component effects.** These files own subscription
  *ordering* — two stores reacting to the same change in an unpredictable order is a
  real bug class this wiring exists to prevent.
- **The middleware chain (persist → devtools → temporal → subscribeWithSelector) is
  composed once, in `middlewares.ts`.** It's a coordination point: every store that
  needs persistence or undo goes through the same factory so behavior stays uniform.
- **Painting and shatter/heal must stay synchronous-feeling despite being
  feature-state-driven.** `MapRenderSubscriber` (`mapRenderSubs.ts`) applies
  `mapRef.setFeatureState(...)` directly from store subscriptions rather than
  re-rendering layers, because a full layer re-render per paint gesture would be
  visibly slow.
- **Map load-state gating (`mapRenderingState` / `appLoadingState` — see
  `RENDERING_STATES`/`APP_LOADING_STATES`) must be preserved before any render call.**
  Every render method in `mapRenderSubs.ts` checks these first; skipping the check
  means writing feature-state against a source that isn't loaded yet.
- **Heavy geometry/tabular work belongs in `GeometryWorker`/`ParquetWorker`, not the
  render path.** GEOS-derived dissolve/centroid math and parquet range scans are slow
  enough to freeze `mousemove`-driven paint if run on the main thread — see
  [references/workers.md](references/workers.md).

## Objectives and tradeoffs

Paint/shatter/heal optimizes for *feels instantaneous under continuous mouse movement*
over always-consistent history: assignments are buffered in
`accumulatedAssignments` and only ingested (`ingestAccumulatedAssignments`) at gesture
end, trading a brief window of buffered-but-unpersisted state for one coalesced write
and one undo/redo entry per gesture instead of one per mouse event. When automatic
side effects (auto-heal after a shatter-adjacent paint) run inside that same gesture,
they must fold into the gesture's single undo entry rather than opening their own — see
the #634/#a02f866 history below for the regression this produced.

## Territory map

### Page composition
- `app/src/app/(interactive)/map/` — map viewer/editor route group
- `app/src/app/components/MapPage/MapPage.tsx`
- `app/src/app/components/Map/MainMap.tsx` (district mode), `CoiMap.tsx` (community mode)
- `app/src/app/components/Map/MapContainer.tsx` — shared shell: events, basemap, locking, cursor

### Stores (primary)
- `app/src/app/store/mapStore.ts` — map document, map ref, load state
- `app/src/app/store/assignmentsStore.ts` — zone assignments, shatter state, accumulate/ingest
- `app/src/app/store/coiAssignmentsStore.ts` — community-mode equivalent
- `app/src/app/store/mapControlsStore.tsx` — tool selection, map options

### Stores (supporting)
- `app/src/app/store/demography/demographyStore.ts`, `overlayStore.ts`, `toolbarStore.ts`,
  `tooltipStore.ts`, `chartStore.ts`, `temporalStore.ts` (undo/redo), `saveShareStore.ts`

### Subscription & middleware architecture
- `app/src/app/store/subscriptions.tsx` — initializes all cross-store subscriptions
- `app/src/app/store/mapEditSubs.ts`, `metricsSubs.ts` — side-effect and metrics subscriptions
- `app/src/app/store/middlewares.ts` — middleware composition factory
- `app/src/app/store/middlewareConfig.ts` — per-store middleware configuration

### Runtime, layers, workers (see references)
- Events/rendering: `app/src/app/utils/events/mapEvents.ts`, `app/src/app/utils/map/mapRenderSubs.ts`
- Layers/styling: `app/src/app/constants/map/*`, `app/src/app/components/Map/PolygonLayers/*`
- Workers: `app/src/app/utils/GeometryWorker/*`, `app/src/app/utils/ParquetWorker/*`

## Causal history

- **Layer separation (PR #492, Feb 2026, "Separate out drawing responsibility of
  different layers so the zone layer doesn't handle everything").** A single monolithic
  `Map.tsx` was split into `MapContainer` (shell), `MainMap`/`CoiMap` (mode shells),
  `MapLayerAnchors` (render-order anchors), and per-scope layer components
  (`BlockLayers` → `ZoneLayerGroup`). The current layer-component territory map in
  [references/layers-and-styling.md](references/layers-and-styling.md) rests on this
  split; a change that reintroduces cross-cutting drawing logic in one component is
  reversing it.
- **Undo/redo went per-gesture instead of time-throttled (PR #634, Jul 2026), then a
  regression was fixed in the same area (commit `07af68f6`, "Coalesce auto-heal set()
  into the triggering gesture's undo entry").** Per-gesture snapshots exposed a bug the
  old 3-second throttle had been masking: `ingestAccumulatedAssignments()` bumps
  `clientLastUpdated`, and the auto-heal that can follow a paint
  (`healParentsIfAllChildrenInSameCommunities`) bumped it again milliseconds later —
  producing two history entries per gesture. The fix suppresses undo tracking around
  the heal's `set()` call so healing folds into the gesture that triggered it. Any new
  automatic post-paint side effect needs the same treatment, not a new undo entry.
- **Msgpack + unassigned-geometry optimization (PR #550, Jun 2026).** Assignment
  payload transfer and `geometryWorker.ts`'s unassigned-area computation were reworked
  together for throughput — grounds the invariant that GeometryWorker, not the store or
  render path, is where expensive per-assignment geometry work lives.

## References

- [references/layers-and-styling.md](references/layers-and-styling.md) — layer stack,
  tile source, style expressions, shatter filters, basemaps/overlays, district vs
  community (COI) rendering differences.
- [references/runtime-events.md](references/runtime-events.md) — MapLibre interaction
  model, `mapEvents.ts`/`mapRenderSubs.ts`, feature-state mechanics, paint/shatter event
  flow.
- [references/workers.md](references/workers.md) — GeometryWorker/ParquetWorker
  contracts, what runs where and why.

## See also

- [learn-state-sync](../learn-state-sync/SKILL.md) — IDB/server sync and conflict
  resolution for the assignments this skill paints.
- [learn-map-data](../learn-map-data/SKILL.md) — how the map module (tileset, parent/child
  layers, graph) this skill renders comes to exist.
