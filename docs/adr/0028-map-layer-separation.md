# 28. Map drawing split into per-scope layer components

Date: 2026-02-18 (recorded retrospectively 2026-09-08)

## Status

Accepted.

## Context

A single `MapComponent(isDemographicMap?)` pattern and a monolithic `Map.tsx` handled all map-drawing responsibility, making draw order implicit and layer behavior hard to reason about as more layer types and modes accumulated (PR #492).

## Decision

Split map rendering by source/layer type into focused components (`MapContainer` as the shell, `MainMap` and `DemographicMap` as mode shells), organized into single-idea folders (`GeoSources/`, `PolygonLayers/`, `PointLayers/`). Make draw order explicit and deterministic via named anchors (`MapLayerAnchors`, `MAP_LAYER_ANCHOR_IDS` in `constants/map/layerIds.ts`) and an explicit polygon-order contract (`DEFAULT_BLOCK_LAYER_ORDER` in `constants/map/layerRenderConfig.ts`).

## Consequences

No single component owns all map-drawing responsibility; draw order is declared through named anchors instead of being implicit in component render order. This established the layer-anchor pattern later relied on when adding new layers (e.g. the `reference` anchor added for county boundaries, PR #597).
