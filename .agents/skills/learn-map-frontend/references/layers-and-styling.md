# Map Layers and Styling

Layer stack, sources, map types (district vs community/COI), style expressions,
shatter filters, overlays, and basemap composition. Verified against the codebase as
of 2026-08-27.

## Table of contents

- [Map types](#map-types)
- [Layer stack](#layer-stack)
- [Tile source configuration](#tile-source-configuration)
- [Style expressions](#style-expressions)
- [Shatter layer filtering](#shatter-layer-filtering)
- [Basemaps](#basemaps)
- [Overlays](#overlays)
- [Common failure modes](#common-failure-modes)

## Map types

The app supports three map types (`DistrictrMap.map_type`): `"default"`, `"local"`, and
`"community"`.

| Aspect | District (`default`/`local`) | Community (`community`) |
|--------|------------------------------|------------------------|
| Route | `/map/edit/[map_id]` | `/coi/edit/[document_id]` |
| Page component | `MapPage` → `MainMap` | `CoiMapPage` → `CoiMap` |
| Layer component | `BlockLayers` → `ZoneLayerGroup` | `CoiBlockLayers` → `CoiAssignmentLayers` |
| Assignment store | `assignmentsStore` | `coiAssignmentsStore` |
| Default basemap | MINIMAL | STREETS |
| Zone numbers | Shown | Hidden |
| Feature-state key | `zone` (1-indexed integer) | `community` + per-community flags (`community_1`, `community_2`, ...) |
| Color source | Color scheme array → zone index | Per-community color from `community.color` |
| Visibility control | Global `showPaintedDistricts` | Per-community `communityVisibility` map |
| Render ordering | Single layer per scope | One layer per community, selected community on top |

Map mode (`'districts'` | `'coi'`) is set via `useInitializeMapMode`, which applies
mode-specific defaults from `mapModeDefaults.ts` before document loading begins.

## Layer stack

Layers are ordered via invisible anchor layers created by `MapLayerAnchors`. From top to
bottom:

```
anchor-hover              <- Hover/tooltip layers
anchor-overlays           <- User overlay layers
anchor-demography         <- Demographic choropleth
anchor-assignments        <- Zone/community fill + highlight layers
anchor-geometry-outline   <- Geometry outlines
anchor-counties           <- County boundaries + labels
[basemap layers]          <- Basemap (MINIMAL, STREETS, SATELLITE)
```

Block layers (both parent and child scopes) position themselves relative to these
anchors via `DEFAULT_BLOCK_LAYER_ORDER`:
- Background fill → `anchor-assignments`
- Zone/community fill → `anchor-assignments`
- Demography fill → `anchor-demography`
- Hover layer → `anchor-hover`
- Outline layer → `anchor-geometry-outline`

This anchor-based ordering is what replaced a single component that drew every layer
inline — see the layer-separation history in the parent skill's causal history section
(PR #492).

## Tile source configuration

All map geometries come from a single PMTiles vector source:

- **Source ID**: `'blocks'` (constant: `CANONICAL_LAYER_IDS.SOURCES.BLOCK`)
- **URL pattern**: `pmtiles://{TILESET_URL}/{mapDocument.tiles_s3_path}`
- **Feature ID property**: `promoteId="path"` — the `path` property becomes the feature
  ID for `setFeatureState`. This is why `path` is treated as a reserved column name
  during GerryDB import (`backend/app/utils.py` excludes it from user-facing numeric
  columns alongside `geometry`/`geography`/`fid`).
- **Source layers**: A single PMTiles file may contain multiple source-layers:
  - `mapDocument.parent_layer` — parent geography (e.g., VTDs, precincts)
  - `mapDocument.child_layer` — child geography for shatter (e.g., census blocks), nullable

## Style expressions

### Zone coloring (districts)
`ZONE_ASSIGNMENT_STYLE(colorScheme)` builds a `case` expression:
```
['case',
  ['==', ['feature-state', 'zone'], 1], colorScheme[0],
  ['==', ['feature-state', 'zone'], 2], colorScheme[1],
  ...
  '#cecece']  // fallback for unassigned
```

### Community coloring (COI)
Each community gets its own layer with a single fill color. Membership is determined by
the feature-state flag `community_{id}`. `COMMUNITY_ASSIGNMENT_STYLE` builds a similar
`case` expression for the shared rendering path.

### Fill opacity
`getLayerFill(captiveIds?, isDemographic?)` builds a `case` expression controlling
opacity:
- `broken: true` → 0 (hidden shattered parent)
- Assigned + hovered → base + 0.3
- Assigned → base + 0.1
- Unassigned → 0

### Highlight/focus outlines
`ZoneHighlightLayer` uses feature-state to control outline color and width:
- `focused: true` → black, 3.5px
- `highlighted: true` → yellow (`#e5ff00`), 3.5px
- Unassigned (when highlight enabled) → red, 3.5px

## Shatter layer filtering

Parent and child scopes share the same vector source but use different source-layers
and filters, built by `useLayerFilter(child: boolean)`:

- **Parent layer filter**: excludes shattered parent IDs →
  `['!', ['match', ['get', 'path'], [...parentIds], true, false]]`
- **Child layer filter**: includes only child IDs →
  `['match', ['get', 'path'], [...childIds], true, false]`

When a parent is shattered:
1. Parent feature-state gets `broken: true` (hides via opacity expression)
2. Parent ID is added to the exclusion filter
3. Child features appear via the inclusion filter
4. Assignments transfer from parent to children

The filter reads `shatterIds` from whichever assignments store the active map mode
uses (`assignmentsStore` for districts, `coiAssignmentsStore` for COI) — see
[runtime-events.md](runtime-events.md) for how shatter state itself gets computed.

## Basemaps

Three basemap options defined in `BASEMAP_IDS`:
- `MINIMAL` — default for district mode
- `STREETS` — default for community mode
- `SATELLITE` — available in both modes

Basemap switching is handled in `MapContainer` via the map style URL; `mapRenderSubs.ts`
re-runs a full `render()` pass on `basemap` change (waiting for the map's `idle` event)
because a style change discards custom layers that must be re-added.

## Overlays

Overlay layers are positioned at `anchor-overlays` and support both PMTiles and GeoJSON
sources. Overlay constraints can restrict painting (managed by `overlayStore`). Layer
IDs use the `OVERLAY` prefix constants.

## Common failure modes

- Ghost features from shatter filter mismatch (parent visible when it should be hidden,
  or child missing).
- Wrong colors in COI mode from using the `zone` feature-state key instead of
  `community_{id}`.
- Layer z-order bugs from adding layers without correct `beforeId` anchor.
- Community layer ordering bugs from not sorting by render order or not bringing the
  selected community to the top.
- Basemap switch losing custom layers because they weren't re-added after the style
  change.
- Overlay layers obscuring assignments due to incorrect anchor positioning.
