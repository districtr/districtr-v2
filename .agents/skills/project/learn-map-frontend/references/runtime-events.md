# Map Runtime Events

MapLibre interaction model, feature-state mechanics, and the paint/shatter/heal event
flow. Verified against the codebase as of 2026-08-27.

## Table of contents

- [Two halves: events in, state out](#two-halves-events-in-state-out)
- [Feature-state is the rendering contract](#feature-state-is-the-rendering-contract)
- [MapRenderSubscriber](#maprendersubscriber)
- [Paint: accumulate then ingest](#paint-accumulate-then-ingest)
- [Shatter and heal](#shatter-and-heal)
- [The undo/heal regression](#the-undoheal-regression)
- [Common failure modes](#common-failure-modes)

## Two halves: events in, state out

Map interaction splits across two files with a clean input/output boundary:

- `app/src/app/utils/events/mapEvents.ts` — raw MapLibre events (`click`, `mousemove`,
  `mousedown`/`mouseup`) become tool-specific actions (paint, erase, shatter, hover,
  inspect). It decides *which layers are clickable* per active tool
  (`getLayerIdsToPaint`) and writes the result into stores (`assignmentsStore`,
  `tooltipStore`, `mapControlsStore`).
- `app/src/app/utils/map/mapRenderSubs.ts` — the `MapRenderSubscriber` class. It
  subscribes to store changes and is the *only* place that calls
  `mapRef.setFeatureState()` / `mapRef.setPaintProperty()` for shatter, focus, cursor,
  color, and demography rendering. Events never touch the map directly; they change
  store state, and the subscriber reacts.

This separation is why "re-implementing zone-color rendering outside `mapRenderSubs`"
is a real anti-pattern rather than a style preference: a second write path would race
the subscriber's own previous-state diffing (`previousColorState`,
`previousCommunityAssignments`) and produce flicker or stale colors.

Mutation is access-gated once per session: `mapEvents.ts` caches
`mapDocument?.access === ACCESS_STATES.EDIT` in a module-level `_canMutate` flag,
invalidated when `mapDocument` changes (and disposed on HMR reload in dev).

## Feature-state is the rendering contract

MapLibre feature-state is the live per-feature rendering surface, keyed by the PMTiles
`path` property (see `promoteId="path"` in
[layers-and-styling.md](layers-and-styling.md)). Keys in active use: `zone`, `broken`,
`focused`, `highlighted`, `locked`, `selected`, and per-community `community_{id}`
flags. Style expressions in `layerStyle.ts` read these keys directly — changing a key
name or its layer requires updating the style expression in the same change.

`MapRenderSubscriber` reads MapLibre's internal feature-state cache
(`mapRef.style.sourceCaches[BLOCK_SOURCE_ID]._state.state` /
`.stateChanges`) to diff desired vs. actual state before writing, so unchanged features
are skipped rather than re-set on every store tick (`isCommunityStateUpToDate`,
`checkCommunitySetsEqual`). This diffing is what keeps continuous paint gestures from
re-touching every already-correct feature.

## MapRenderSubscriber

One `MapRenderSubscriber` instance owns a `mapRef` and subscribes to `mapStore`,
`mapControlsStore`, `assignmentsStore`/`coiAssignmentsStore`, and `demographyStore`. Its
`subscribe()` method wires five independent render loops, each gated by
`mapRenderingState === LOADED && appLoadingState === LOADED` before touching the map:

- `subscribeShatter` / `renderShatter` — hides broken parents, exposes children
- `subscribeFocus` / `renderFocus` — focus/highlight outline state
- `subscribeCursor` / `renderCursor` — swaps the paint-selection function
  (`getFeaturesInBbox` vs `getFeatureUnderCursor`) by active tool
- `subscribeColorZones` / `renderColorZones` — zone/community fill color, skipped while
  `isPainting` (painting drives its own hover-layer feedback instead)
- `subscribeDemographyColors` / `renderDemographyColors` — choropleth coloring, also
  triggered on the map's native `sourcedata` event when the block source finishes
  loading

`checkRender()` is a lightweight reconciliation pass: it samples up to 10 recent
assignments and calls a full `render()` only if their feature-state is out of sync —
a guard against drift without diffing every assignment on every tick.

## Paint: accumulate then ingest

Painting does not write to `zoneAssignments` (and MapLibre feature-state) on every
mouse event. Instead:

1. Each paint event adds to `accumulatedAssignments` (a `Map<geoid, zone>`) in
   `assignmentsStore`, skipping locked/unchanged features.
2. `ingestAccumulatedAssignments()` runs at gesture end, moving the buffer into
   `zoneAssignments` and clearing it — one write, one undo/redo entry, one
   `mapRenderSubs` color pass.

This buffering is what "accumulate-then-ingest flow; do not bypass it" protects: a
direct write to `zoneAssignments` mid-gesture would trigger `renderColorZones` on every
mouse event instead of once, and would defeat per-gesture undo grouping (below).

## Shatter and heal

Shattering replaces a parent feature with its child features for finer-grained
painting. `renderShatter()` in `mapRenderSubs.ts`:

- Sets `broken: true`, `zone: null` (and clears community flags) on newly-shattered
  parent IDs, hiding them via the opacity expression.
- Clears `broken`/`highlighted` on IDs that were shattered but no longer are (heal).
- Relies on `shatterIds.parents`/`shatterIds.children` staying consistent with the
  layer filters in [layers-and-styling.md](layers-and-styling.md#shatter-layer-filtering)
  — a mismatch there produces ghost features, not a runtime error, so it's easy to miss.

"Heal" (auto-unshatter when all of a parent's children end up in the same
zone/community again) runs as an automatic consequence of a paint gesture, not a
user-initiated action — which is why its undo-entry treatment mattered (next section).

## The undo/heal regression

Per-gesture undo/redo (PR #634, Jul 2026) replaced a 3-second time-throttle. This
exposed a real bug fixed shortly after in commit `07af68f6` ("Coalesce auto-heal set()
into the triggering gesture's undo entry"): in the COI store,
`ingestAccumulatedAssignments()` bumps `clientLastUpdated`, and
`healParentsIfAllChildrenInSameCommunities()` (triggered by either a paint or exiting
block view) bumps it again milliseconds later; the district store's equivalent heal
branch (triggered by exiting block view) does the same. Under the old throttle both
bumps landed in the same 3-second window and were invisible; under per-gesture
snapshots they became two separate history entries, so the first "undo" restored the
transient post-paint/pre-heal state instead of reverting the whole gesture. The fix
pauses the store's temporal (undo/redo) tracking around the heal's `set()` call and
resumes it after, so the heal folds into the triggering gesture's entry instead of
opening its own. Any new automatic post-gesture side effect needs the same
pause/resume, or it will reproduce this bug shape.

## Common failure modes

- Ghost paint artifacts from unsynchronized feature-state updates (writing state
  outside `mapRenderSubs`).
- Incorrect child/parent assignment transitions during heal.
- Hover/select mismatches from layer ID/filter changes.
- Map lock not released due to skipped render-state handoffs (`renderShatter` releases
  the lock on the map's next `render` event — a skipped `renderShatter` call leaves the
  lock stuck).
- Extra/duplicate undo entries from an automatic side effect that doesn't suppress undo
  tracking (see the regression above).
