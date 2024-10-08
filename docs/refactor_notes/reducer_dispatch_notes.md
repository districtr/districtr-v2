# Notes on refactorizing the reducer and dispatch functions

### dispatch object from `compoenents`

- mapboxMap: null,
- mapboxAccessToken: mapboxAccessToken; should be handled at the app level
- ~~mapboxStyle: mapStyleOptions.current[mapStyle].url,~~: in `configuration.ts` as an options property of `maplibre` map
- mapboxContainer: 'districtr-mapbox',
- ~~initialViewState: initialViewState,~~: factored out, see below; only exists as a subset of `maplibre` map options which are otherwise defined.
- terrain: true,
- satellite: false,
- ~~zoom: initialViewState.zoom,~~: in `configuration.ts` as an options property of `maplibre` map
- ~~center: [initialViewState.longitude, initialViewState.latitude],~~: in `configuration.ts` as an options property of `maplibre` map
- ~~latitude: initialViewState.latitude,~~: not accessed directly (only as child of center); removing as a state property
- ~~longitude: initialViewState.longitude,~~: not accessed directly (only as child of center); removing as a state property
- ~~bearing: initialViewState.bearing,~~: in `configuration.ts` as an options property of `maplibre` map
- ~~pitch: initialViewState.pitch,~~: in `configuration.ts` as an options property of `maplibre` map
- ~~bounds: initialViewState.bounds,~~: in `configuration.ts` as an options property of `maplibre` map
- tools: toolsConfig,
- ~~activeTool: 'pan'~~,: types in `types.ts`; `set in mapStore.ts`
- ~~units: unitsConfig~~,
- ~~activeUnit: 1~~,
- palette: [],
- sources: sources,

  - i think this should be a string that represents the geography of focus based on `fips` code if possible that can be used to filter the map; we will want only one source or a generic convention for sources imo

  - i think this should be a string that represents the geography of focus based on `fips` code if possible that can be used to filter the map; we will want only one source or a generic convention for sources imo

  - i think this should be a string that represents the geography of focus based on `fips` code if possible that can be used to filter the map; we will want only one source or a generic convention for sources imo

  - i think this should be a string that represents the geography of focus based on `fips` code if possible that can be used to filter the map; we will want only one source or a generic convention for sources imo

- layers: layers,
- ~~coloring: false~~,
- interactiveLayerIds: interactiveLayerIds,
- activeInteractiveLayer: 0,
- cursorVisible: true,
- ~~**unitAssignments: new Map()**,~~: zone membership in plans. the basis of `zoneAssignments` in `zoneStore.ts` so won't be needed here.
- **unitPopulations: new Map(),**: stats on the above; unclear where this will be handled in the new structure
- unitColumnPopulations: new Map(),
- columnKeys: [],
- geometryKey: columnSets[interactiveLayerIds[0]].geometryKey,
- featureKey: columnSets[interactiveLayerIds[0]].columnSets[0].total.key,
- populationSum: columnSets[interactiveLayerIds[0]].columnSets[0].total.sum,
- ~~hoveredFeatures: [],~~
- ~~brushSizeValue: 50,~~
- ~~brushSize: 100,~~
- columnSets: columnSets,
- lockedUnits: new Set(),
- hiddenUnits: new Set(),
- compositorData: compositorData,
- ~~paintByCounty~~: false,: we will likely want a type for this in `types.ts` and a state property in `mapStore.ts`. typed as `SpatialUnit` in `types.ts`. Will have to think through how this is used / how it interacts with what is rendered on the map.
- ~~paintedCountyGEOIDs: new Set()~~,: this is going to live in `zoneStore.ts`, details tbd, but is the county-level fips membership (if painting at county level) of geom membership in painted plans. see [here](https://github.com/uchicago-dsi/districtr-components/blob/2e8f9e5657b9f0fd2419b6f3258efd74ae310f32/src/Districtr/reducers/districtrReducer.ts#L451) for implementation info. **Still an open question how we handle multi-level geoms?** tbd
- ~~changedFeatures: [],~~: same as above- this is currently typed as `any` and I don't think it's even in use
- changeHistory: [],
- historyIndex: -1,
- events: [
- ~~['click', (e) => onMapClick(e)],~~
- ~~['mouseup', (e) => onMapMouseUp(e)],~~
- ['touchend', (e) => onMapMouseUp(e)],
- ['mousedown', (e) => onMapMouseDown(e)],
- ['touchstart', (e) => onMapMouseDown(e)],
- ['mouseenter', (e) => onMapMouseEnter(e)],
- ['mouseover', (e) => onMapMouseOver(e)],
- ['mouseleave', (e) => onMapMouseLeave(e)],
- ['touchleave', (e) => onMapMouseLeave(e)],
- ['mouseout', (e) => onMapMouseOut(e)],
- ~~['mousemove', (e) => onMapMouseMove(e)],~~
- ['touchmove', (e) => onMapMouseMove(e)],
- ['zoom', (e) => onMapZoom(e)],
- ['idle', () => onMapIdle()],
- ['moveend', (e) => onMapMoveEnd(e)],
- ['zoomend', (e) => onMapZoomEnd(e)]
  ],
- intializeDistrictrState

## from original districtr

onMouseDown, onMouseUp, onClick, onTouchStart << all bound to CommunityBrush in https://github.com/districtr/districtr/blob/de85e7801e47f71433a8951e248c1ef71abc641c/src/map/CommunityBrush.js#L5
