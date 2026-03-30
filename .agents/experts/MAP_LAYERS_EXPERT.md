# MAP_LAYERS_EXPERT

## Purpose
Define the map layer rendering architecture: layer stack, source configuration, map type rendering differences (district vs community/COI), style expressions, shatter filters, overlays, and basemap composition.

## When To Use
- You are adding, removing, or reordering map layers.
- You are changing how zones or communities are colored or styled.
- You are modifying tile source configuration or PMTiles loading.
- You are changing basemap, overlay, or county layer behavior.
- You are working on community (COI) vs district rendering differences.
- You are changing shatter-related layer filtering.

## Map Types

The app supports three map types (`DistrictrMap.map_type`): `"default"`, `"local"`, and `"community"`.

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

### Mode initialization
Map mode (`'districts'` | `'coi'`) is set via `useInitializeMapMode` hook, which applies mode-specific defaults from `mapModeDefaults.ts` before document loading begins.

## Canonical Files

### Layer definitions & ordering
- `app/src/app/constants/map/layerIds.ts` — canonical layer ID constants (`BLOCK`, `ZONE_LABELS`, `OVERLAY`, `COUNTIES`)
- `app/src/app/constants/map/layerRenderConfig.ts` — anchor layer order and default `beforeId` mappings

### Style expressions
- `app/src/app/constants/map/layerStyle.ts` — `ZONE_ASSIGNMENT_STYLE`, `COMMUNITY_ASSIGNMENT_STYLE`, `getLayerFill`, basemap IDs, opacity constants
- `app/src/app/constants/map/overlayLayerStyles.ts` — overlay-specific styling

### Sources
- `app/src/app/components/Map/GeoSources/BlockSource.tsx` — PMTiles vector source (`blocks`), registers `pmtiles://` protocol
- `app/src/app/components/Map/GeoSources/PointSource.tsx` — selection point sources (parent + child)

### District layer components
- `app/src/app/components/Map/PolygonLayers/BlockLayers.tsx` — orchestrates parent/child `ZoneLayerGroup` instances
- `app/src/app/components/Map/PolygonLayers/ZoneLayers/ZoneLayerGroup.tsx` — composes assignment + highlight + hover layers
- `app/src/app/components/Map/PolygonLayers/ZoneLayers/ZoneAssignmentLayer.tsx` — fill layer with zone color expression
- `app/src/app/components/Map/PolygonLayers/ZoneLayers/ZoneHighlightLayer.tsx` — outline layer for focus/highlight/broken states

### Community (COI) layer components
- `app/src/app/components/Map/PolygonLayers/CoiBlockLayers.tsx` — orchestrates per-community layers with visibility + render order
- `app/src/app/components/Map/PolygonLayers/CoiAssignmentLayers.tsx` — creates one layer per community, manages selected-on-top ordering
- `app/src/app/components/Map/PolygonLayers/CoiAssignmentLayer.tsx` — individual community fill layer

### Map containers
- `app/src/app/components/Map/MainMap.tsx` — district map shell (uses `BlockLayers`)
- `app/src/app/components/Map/CoiMap.tsx` — community map shell (uses `CoiBlockLayers`)
- `app/src/app/components/Map/MapContainer.tsx` — shared map shell (events, basemap, locking, cursor)

### Supporting
- `app/src/app/components/Map/MapLayerAnchors.tsx` — creates invisible anchor layers that define render order
- `app/src/app/components/Map/PolygonLayers/CountyLayers.tsx` — county boundary + label layers
- `app/src/app/components/Map/PolygonLayers/OverlayLayers.tsx` — user-provided overlay layers
- `app/src/app/hooks/useLayerFilter.ts` — shatter-aware layer filter expressions
- `app/src/app/hooks/useInitializeMapMode.ts` — mode initialization hook
- `app/src/app/constants/map/mapModeDefaults.ts` — per-mode default options
- `app/src/app/constants/map/mapDefaults.ts` — numeric limits (districts, communities)
- `app/src/app/utils/map/mapRenderSubs.ts` — render subscriber that applies feature-state to layers

## Layer Stack

Layers are ordered via invisible anchor layers created by `MapLayerAnchors`. From top to bottom:

```
anchor-hover              ← Hover/tooltip layers
anchor-overlays           ← User overlay layers
anchor-demography         ← Demographic choropleth
anchor-assignments        ← Zone/community fill + highlight layers
anchor-geometry-outline   ← Geometry outlines
anchor-counties           ← County boundaries + labels
[basemap layers]          ← Basemap (MINIMAL, STREETS, SATELLITE)
```

Block layers (both parent and child scopes) position themselves relative to these anchors via `DEFAULT_BLOCK_LAYER_ORDER`:
- Background fill → `anchor-assignments`
- Zone/community fill → `anchor-assignments`
- Demography fill → `anchor-demography`
- Hover layer → `anchor-hover`
- Outline layer → `anchor-geometry-outline`

## Tile Source Configuration

All map geometries come from a single PMTiles vector source:

- **Source ID**: `'blocks'` (constant: `CANONICAL_LAYER_IDS.SOURCES.BLOCK`)
- **URL pattern**: `pmtiles://{TILESET_URL}/{mapDocument.tiles_s3_path}`
- **Feature ID property**: `promoteId="path"` — the `path` property becomes the feature ID for `setFeatureState`
- **Source layers**: A single PMTiles file may contain multiple source-layers:
  - `mapDocument.parent_layer` — parent geography (e.g., VTDs, precincts)
  - `mapDocument.child_layer` — child geography for shatter (e.g., census blocks), nullable

## Style Expressions

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
Each community gets its own layer with a single fill color. Membership is determined by the feature-state flag `community_{id}`. The `COMMUNITY_ASSIGNMENT_STYLE` builds a similar case expression but is used for the shared rendering path.

### Fill opacity
`getLayerFill(captiveIds?, isDemographic?)` builds a `case` expression controlling opacity:
- `broken: true` → 0 (hidden shattered parent)
- Assigned + hovered → base + 0.3
- Assigned → base + 0.1
- Unassigned → 0

### Highlight/focus outlines
`ZoneHighlightLayer` uses feature-state to control outline color and width:
- `focused: true` → black, 3.5px
- `highlighted: true` → yellow (#e5ff00), 3.5px
- Unassigned (when highlight enabled) → red, 3.5px

## Shatter Layer Filtering

Parent and child scopes share the same vector source but use different source-layers and filters:

- **Parent layer filter**: Excludes shattered parent IDs → `['!', ['match', ['get', 'path'], [...parentIds], true, false]]`
- **Child layer filter**: Includes only child IDs → `['match', ['get', 'path'], [...childIds], true, false]`

When a parent is shattered:
1. Parent feature-state gets `broken: true` (hides via opacity expression)
2. Parent ID is added to the exclusion filter
3. Child features appear via the inclusion filter
4. Assignments transfer from parent to children

Filter construction lives in `useLayerFilter(child: boolean)`.

## Basemaps

Three basemap options defined in `BASEMAP_IDS`:
- `MINIMAL` — default for district mode
- `STREETS` — default for community mode
- `SATELLITE` — available in both modes

Basemap switching is handled in `MapContainer` via the map style URL.

## Overlays

Overlay layers are positioned at `anchor-overlays` and support both PMTiles and GeoJSON sources. Overlay constraints can restrict painting (managed by `overlayStore`). Layer IDs use the `OVERLAY` prefix constants.

## Hard Invariants
- Layer ordering must be maintained via anchor layers. Never use hardcoded `beforeId` values that bypass the anchor system.
- The `blocks` source ID and `promoteId="path"` are load-bearing contracts — feature-state, filters, and event queries all depend on them.
- District mode uses a single layer per scope (parent/child). COI mode uses one layer per community per scope. Do not conflate these patterns.
- Community layers must maintain render-order sorting with the selected community on top.
- Shatter filter expressions must stay in sync with `shatterIds` in the assignment store. A mismatch causes ghost features or missing geometry.
- `parent_layer` and `child_layer` source-layer names come from `mapDocument` (set during map creation). Never hardcode source-layer names.
- Feature-state keys differ by mode: `zone` for districts, `community` + `community_{id}` flags for COI. Layer components must use the correct key for their mode.
- Basemap defaults are mode-dependent (MINIMAL for districts, STREETS for COI). Preserve this mapping in `mapModeDefaults.ts`.

## Anti-Patterns
- Adding layers without positioning them relative to an anchor layer.
- Hardcoding source-layer names instead of reading from `mapDocument.parent_layer` / `child_layer`.
- Creating zone color expressions that assume a fixed number of zones.
- Mixing district and community feature-state keys in the same layer component.
- Bypassing `useLayerFilter` to build custom shatter filter expressions.
- Changing layer ordering without verifying the anchor layer insertion points in `layerRenderConfig.ts`.
- Rendering community layers without respecting `communityVisibility` state.

## Change Checklist
1. Verify layer ordering is correct by checking anchor layer positions.
2. Test both district and community map types — they use different layer components and feature-state keys.
3. Confirm shatter transitions: parent layers hide, child layers appear, no ghost features.
4. Validate overlay layers render above assignments but below hover.
5. Test basemap switching in both map modes.
6. Verify community visibility toggling hides/shows individual community layers.
7. Confirm zone coloring works across the full range of zones (up to 538 for districts, up to 8 for communities).

## Validation Commands
- `cd app && bun run build`
- `cd app && bun run ts`
- Manual flows: switch basemaps, toggle overlays, paint zones in district mode, paint communities in COI mode, shatter/heal, toggle community visibility.

## See Also
- [MAP_RUNTIME_EXPERT.md](./MAP_RUNTIME_EXPERT.md) — interaction events, feature-state mutation, paint tools
- [FE_EXPERT.md](./FE_EXPERT.md) — store architecture, subscription model, worker offloading
- [STATE_SYNC_EXPERT.md](./STATE_SYNC_EXPERT.md) — assignment persistence and conflict resolution
- [GERRYDB_MAP_LIFECYCLE_EXPERT.md](./GERRYDB_MAP_LIFECYCLE_EXPERT.md) — how maps and tilesets are created upstream

## Common Failure Modes
- Ghost features from shatter filter mismatch (parent visible when it should be hidden, or child missing).
- Wrong colors in COI mode from using `zone` feature-state key instead of `community_{id}`.
- Layer z-order bugs from adding layers without correct `beforeId` anchor.
- Community layer ordering bugs from not sorting by render order or not bringing selected community to top.
- Basemap switch losing custom layers because they weren't re-added after style change.
- Overlay layers obscuring assignments due to incorrect anchor positioning.
