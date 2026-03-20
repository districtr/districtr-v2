# FE_EXPERT

## Purpose
Document frontend architecture and conventions for a map-first, interaction-heavy app that is not a traditional CRUD website.

## When To Use
- You are changing interactive map behavior, rendering, painting, or shattering.
- You are adding/modifying frontend stores, workers, or API handlers.
- You are touching page composition for `/map` and `/map/edit/*`.

## Runtime & Tooling
- **Package manager**: Bun (used in Docker and for all `bun run` scripts)
- **Framework**: Next.js with app router, route groups `(interactive)` and `(static)`
- **State**: Zustand stores with middleware (persist, temporal/undo, devtools, subscribeWithSelector)
- **Map**: MapLibre GL JS via `react-map-gl`

## Canonical Files

### Page composition & components
- `app/src/app/(interactive)/map/` - map viewer/editor route group
- `app/src/app/components/MapPage/MapPage.tsx`
- `app/src/app/components/Map/MainMap.tsx`
- `app/src/app/components/Map/MapContainer.tsx`

### Map events & rendering
- `app/src/app/utils/events/mapEvents.ts`
- `app/src/app/utils/map/mapRenderSubs.ts`

### Stores (primary)
- `app/src/app/store/mapStore.ts` - map document, map ref, load state
- `app/src/app/store/assignmentsStore.ts` - zone assignments, shatter state
- `app/src/app/store/mapControlsStore.tsx` - tool selection, map options

### Stores (supporting)
- `app/src/app/store/demography/demographyStore.ts` - demography display
- `app/src/app/store/overlayStore.ts` - overlay constraints for painting
- `app/src/app/store/toolbarStore.ts` - toolbar UI state
- `app/src/app/store/tooltipStore.ts` - tooltip state
- `app/src/app/store/chartStore.ts` - chart visualization
- `app/src/app/store/temporalStore.ts` - undo/redo state
- `app/src/app/store/saveShareStore.ts` - save/share workflow

### Store subscription & middleware architecture
- `app/src/app/store/subscriptions.tsx` - initializes all cross-store subscriptions
- `app/src/app/store/mapEditSubs.ts` - map editing side-effect subscriptions
- `app/src/app/store/metricsSubs.ts` - metrics computation subscriptions
- `app/src/app/store/middlewares.ts` - Zustand middleware composition factory
- `app/src/app/store/middlewareConfig.ts` - middleware configuration (persist, temporal, devtools)

### Workers, persistence, API
- `app/src/app/utils/GeometryWorker/*`
- `app/src/app/utils/ParquetWorker/*`
- `app/src/app/utils/idb/idb.ts`
- `app/src/app/utils/api/*`

## Hard Invariants
- Frontend state is store-driven (Zustand), not component-local ad hoc state unless truly local to component.
- Cross-store side effects are wired via subscriptions in `subscriptions.tsx` / `mapEditSubs.ts` / `metricsSubs.ts`. Do not scatter ad hoc subscription wiring in components.
- Store middleware chain (persist → devtools → temporal → subscribeWithSelector) is composed in `middlewares.ts`. Do not duplicate or bypass this factory.
- Painting/shattering behavior depends on MapLibre feature-state and must remain synchronous-feeling.
- High-cost geometry/tabular work belongs in Web Workers, not React render paths.
- Demography and assignment behavior must preserve map load-state gating (`initializing/loading/loaded`).
- Conflict/sync behaviors must preserve IDB + server semantics (see [STATE_SYNC_EXPERT.md](./STATE_SYNC_EXPERT.md)).
- Runtime map logic must preserve contracts in [MAP_RUNTIME_EXPERT.md](./MAP_RUNTIME_EXPERT.md).

## Preferred Patterns
- Extend existing store boundaries before adding new global state containers.
- Keep map interaction logic in event handlers/subscribers, not scattered UI components.
- Use existing API factory/handlers under `utils/api` for network behavior.
- Offload heavy computation to [WORKERS_EXPERT.md](./WORKERS_EXPERT.md) paths.
- Reuse typed API contracts from `apiHandlers/types.ts`.

## Anti-Patterns
- Adding heavy loops in `mousemove`/paint paths on the main thread.
- Bypassing stores and mutating map state from unrelated UI components.
- Creating duplicate feature-state logic outside existing render subscriber/event utilities.
- Mixing SSR-only and browser-only logic without guarding worker/map access.

## Change Checklist
1. Identify which store owns the behavior being changed.
2. Verify interaction lifecycle across click/mousedown/mousemove/mouseup.
3. Confirm map rendering state transitions still gate expensive actions.
4. Verify worker and IDB interactions for performance-sensitive changes.
5. Run FE build/type checks and relevant map workflows manually.

## Validation Commands
- `cd app && bun run build`
- `cd app && bun run lint`
- `cd app && bun run ts`

## See Also
- [MAP_RUNTIME_EXPERT.md](./MAP_RUNTIME_EXPERT.md) - Runtime map interaction and rendering rules
- [STATE_SYNC_EXPERT.md](./STATE_SYNC_EXPERT.md) - State synchronization between local and server
- [WORKERS_EXPERT.md](./WORKERS_EXPERT.md) - Web worker contracts and performance

## Common Failure Modes
- Regressed paint behavior from bypassing `assignmentsStore` accumulation/ingestion flow.
- Hover/tooltip flicker from unsafely changing throttled map event handlers.
- Broken map filters from changing source-layer assumptions.
- Subtle sync regressions when local and remote timestamps diverge.
