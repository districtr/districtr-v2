# 28. Map drawing split into per-scope layer components

Date: 2026-02-18 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

A single `MapComponent(isDemographicMap?)` pattern and a monolithic `Map.tsx` handled all map-drawing responsibility, making draw order implicit and layer behavior hard to reason about as more layer types and modes accumulated (PR #492).

## Decision

Split map rendering by source/layer type into focused components (`MainMapComponent`, `DemographicMapComponent`, a shared `MapShell` for common plumbing), organized into single-idea folders (`GeoSources/`, `PolygonLayers/`, `PointLayers/`). Make draw order explicit and deterministic via named anchors (`MapLayerAnchors`/`MAP_LAYER_ANCHORS`) and explicit polygon-order contracts (`MAIN_BLOCK_LAYER_ORDER`, `DEMOGRAPHIC_BLOCK_LAYER_ORDER`).

## Consequences

No single component owns all map-drawing responsibility; draw order is declared through named anchors instead of being implicit in component render order. This established the layer-anchor pattern later relied on when adding new layers (e.g. the `reference` anchor added for county boundaries, PR #597).
