---
name: learn-map-runtime
description: MapLibre interaction model, feature-state, paint/shatter behavior
user-invocable: false
---

# Map Runtime

Source-of-truth runtime rules for map interaction, feature-state rendering, paint tools, and shatter/heal behavior.

## When To Use
- You are changing map events (`click`, `mousemove`, paint interactions).
- You are changing feature-state application or layer filtering.
- You are touching shatter/contiguity-facing map behavior.

## Canonical Files
- `app/src/app/utils/events/mapEvents.ts`
- `app/src/app/utils/map/mapRenderSubs.ts`
- `app/src/app/utils/map/filterFeatures.ts`
- `app/src/app/store/mapStore.ts`
- `app/src/app/store/assignmentsStore.ts`
- `app/src/app/store/mapControlsStore.tsx`
- `app/src/app/store/overlayStore.ts` - overlay constraints that restrict painting
- `app/src/app/store/toolbarStore.ts` - active tool selection (pan, brush, eraser, etc.)
- `app/src/app/components/Map/MapContainer.tsx`
- `app/src/app/components/Map/MainMap.tsx`

## Hard Invariants
- Feature-state is the live rendering contract (`zone`, `broken`, `focused`, `highlighted`, `locked`).
- Painting uses accumulate-then-ingest flow; do not bypass `accumulatedAssignments` lifecycle.
- Shatter state requires consistent parent/child mappings (`parentToChild`, `childToParent`, `shatterIds`).
- Captive/focus modes constrain paintable features; preserve filter behavior.
- Rendering subscriptions must remain store-driven and idempotent.

## Preferred Patterns
- Put interaction logic in event handlers and store methods, not component JSX callbacks.
- Use existing helper functions for spatial selection (`getFeaturesInBbox`, `getFeatureUnderCursor`).
- Keep map load-state checks in place before expensive render updates.
- Use throttling where high-frequency events already depend on it.

## Anti-Patterns
- Bypassing lock/captive/overlay constraints in paint selection.
- Re-implementing color-zone rendering outside `mapRenderSubs` flow.
- Adding expensive geospatial operations in unthrottled `mousemove` paths.

## Change Checklist
1. Confirm tool-specific behavior (`pan`, `brush`, `eraser`, `shatter`, `inspector`).
2. Validate hover, tooltip, and context-menu behavior for changed layers.
3. Validate shatter -> paint -> heal transitions.
4. Validate lock/overlay constraints are respected.
5. Validate map remains responsive under continuous interaction.

## Validation Commands
- `cd app && bun run build`
- Manual flows: paint, erase, shatter, unshatter/heal, overlay-constrained paint, zone comments.

## See Also
- [learn-map-layers](../learn-map-layers/SKILL.md) - Layer stack, sources, map types, style expressions
- [learn-frontend](../learn-frontend/SKILL.md) - Frontend architecture and store-driven state
- [learn-state-sync](../learn-state-sync/SKILL.md) - State synchronization contracts

## Common Failure Modes
- Ghost paint artifacts from unsynchronized feature-state updates.
- Incorrect child/parent assignment transitions during heal.
- Hover/select mismatches from layer ID/filter changes.
- Map lock not released due to skipped render-state handoffs.
