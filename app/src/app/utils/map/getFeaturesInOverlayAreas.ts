import {
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  MapGeoJSONFeature,
  GeoJSONFeature,
  Map as MaplibreMap,
} from 'maplibre-gl';
import {bbox, booleanPointInPolygon, centroid} from '@turf/turf';
import type {MultiPolygon, Polygon, Position} from 'geojson';
import {BLOCK_SOURCE_ID, OVERLAY_LAYER_ID_PREFIXES} from '@/app/constants/map/layerIds';
import {MAP_MODES} from '@constants/map/mode';
import {boxAroundPoint} from '@utils/map/bboxAroundPoint';
import {filterFeatures} from '@utils/map/filterFeatures';
import {fastUniqBy} from '@utils/arrays';
import {overlayIdOf} from '@constants/map/paintBy';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {queryAreaFeatures} from '@/app/store/overlayStore';

// Per-area cache of the units inside each overlay area, so hovering back and
// forth across area lines tests each area once. Only the geometric part is
// cached; locks and the mask are re-applied by filterFeatures every call.
// The whole cache is dropped when its context changes: the document or mode;
// the shatterIds object (breaking or healing swaps which features, a parent
// or its blocks, are paintable, and a stale list would assign both); or the
// view (a pan or zoom loads tiles with more of an area's units).
type LoadedUnit = {unit: MapGeoJSONFeature; center: Position};
let cacheContext: {key: string; shatterIds: object} | null = null;
const unitsByArea = new Map<string, MapGeoJSONFeature[]>();
let loadedUnits: LoadedUnit[] | null = null;

/** Test-only: drop the cache between cases. */
export const resetOverlayAreaCache = () => {
  cacheContext = null;
  unitsByArea.clear();
  loadedUnits = null;
};

/**
 * Paint by overlay area (Paint by > e.g. School districts): every unit inside
 * the overlay areas under the brush footprint. Units come from the loaded
 * tiles (parent units, plus blocks of broken units). A unit belongs to the
 * area containing its center: one point-in-polygon test per unit (polygon
 * clipping against detailed district outlines took seconds per area), and
 * neighbouring areas never share a unit.
 * ponytail: loaded tiles only, so an area reaching off-screen paints only its
 * loaded part (zoom out to include it); a server-side unit/area crosswalk
 * would remove that limit and the client-side geometry pass.
 */
export const getFeaturesInOverlayAreas = (
  map: MaplibreMap | null,
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  brushSize: number,
  _layers?: string[],
  filterLocked: boolean = true
): MapGeoJSONFeature[] | undefined => {
  const {mapMode, mapOptions} = useMapControlsStore.getState();
  const overlayId = overlayIdOf(mapOptions.paintBy);
  const {mapDocument} = useMapStore.getState();
  const clickLayerId = `${OVERLAY_LAYER_ID_PREFIXES.click}${overlayId}`;
  // The layer is gone while its overlay is hidden; querying it would throw.
  if (!map || !overlayId || !mapDocument || !map.getLayer(clickLayerId)) return;
  const areaIds = [
    ...new Set(
      map
        .queryRenderedFeatures(boxAroundPoint(e, brushSize), {layers: [clickLayerId]})
        .map(f => String(f.id))
    ),
  ];
  if (!areaIds.length) return;

  const {shatterIds} =
    mapMode === MAP_MODES.COI ? useCoiAssignmentsStore.getState() : useAssignmentsStore.getState();
  const key = [
    mapDocument.document_id,
    mapMode,
    overlayId,
    map.getZoom().toFixed(2),
    map.getBounds().toArray().flat().join(','),
  ].join('|');
  if (cacheContext?.key !== key || cacheContext.shatterIds !== shatterIds) {
    cacheContext = {key, shatterIds};
    unitsByArea.clear();
    loadedUnits = null;
  }

  const units = areaIds.flatMap(areaId => {
    const cached = unitsByArea.get(areaId);
    if (cached) return cached;
    const pieces = queryAreaFeatures(map, overlayId, areaId).map(a => ({
      polygon: a.geometry as Polygon | MultiPolygon,
      box: bbox(a.geometry),
    }));
    const inside = getLoadedUnits(map, mapDocument, shatterIds)
      .filter(({center: [x, y]}) =>
        pieces.some(
          ({polygon, box}) =>
            x >= box[0] &&
            x <= box[2] &&
            y >= box[1] &&
            y <= box[3] &&
            booleanPointInPolygon([x, y], polygon)
        )
      )
      .map(({unit}) => unit);
    unitsByArea.set(areaId, inside);
    return inside;
  });
  return filterFeatures({_features: units, filterLocked});
};

/** The loaded parent units plus broken units' blocks, once per cache context. */
const getLoadedUnits = (
  map: MaplibreMap,
  mapDocument: NonNullable<ReturnType<typeof useMapStore.getState>['mapDocument']>,
  shatterIds: {children: Set<string>}
) => {
  if (loadedUnits) return loadedUnits;
  // querySourceFeatures leaves source/sourceLayer unset; painting reads them.
  const tag = (sourceLayer: string) => (f: GeoJSONFeature) =>
    Object.assign(f, {source: BLOCK_SOURCE_ID, sourceLayer}) as unknown as MapGeoJSONFeature;
  const parents = map
    .querySourceFeatures(BLOCK_SOURCE_ID, {sourceLayer: mapDocument.parent_layer})
    .map(tag(mapDocument.parent_layer));
  // Child tiles hold every block; only broken units' blocks are paintable.
  const childLayer = mapDocument.child_layer;
  const children =
    childLayer && shatterIds.children.size
      ? map
          .querySourceFeatures(BLOCK_SOURCE_ID, {sourceLayer: childLayer})
          .filter(f => shatterIds.children.has(String(f.id)))
          .map(tag(childLayer))
      : [];
  loadedUnits = fastUniqBy([...parents, ...children], 'id').map(unit => ({
    unit,
    center: centroid(unit.geometry).geometry.coordinates,
  }));
  return loadedUnits;
};
