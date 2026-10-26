import {
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  MapGeoJSONFeature,
  Map as MaplibreMap,
} from 'maplibre-gl';
import {bbox} from '@turf/turf';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerIds';
import {MAP_MODES} from '@constants/map/mode';
import {boxAroundPoint} from '@utils/map/bboxAroundPoint';
import {filterFeatures} from '@utils/map/filterFeatures';
import {isMostlyInside} from '@utils/map/isMostlyInside';
import {fastUniqBy} from '@utils/arrays';
import {overlayIdOf} from '@constants/map/paintBy';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {queryAreaFeatures} from '@/app/store/overlayStore';

type BBox = ReturnType<typeof bbox>;
const bboxesOverlap = (a: BBox, b: BBox) =>
  a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

// Memo of the last areas under the brush and the units inside them, so a drag
// within the same areas skips the geometry pass. Only the geometric part is
// memoized; locks and the mask are re-applied by filterFeatures every call.
// Keyed on the document and the shatterIds object too: breaking or healing a
// unit swaps which features (parent or its blocks) are paintable, and a stale
// list would assign both (orphaned blocks under a healed parent).
let lastKey: string | null = null;
let lastShatterIds: object | null = null;
let lastUnits: MapGeoJSONFeature[] = [];

/**
 * Paint by overlay area (Paint by > e.g. School districts): every unit inside
 * the overlay areas under the brush footprint. Units come from the loaded
 * tiles (parent units, plus blocks of broken units), matched by the same
 * "mostly inside" test as the paint mask.
 * ponytail: loaded tiles only, so an area reaching off-screen paints only its
 * loaded part, and each new area set costs one turf pass over the loaded units
 * (noticeable at state zoom). A server-side unit/area crosswalk fixes both.
 */
export const getFeaturesInOverlayAreas = (
  map: MaplibreMap | null,
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  brushSize: number,
  _layers?: string[],
  filterLocked: boolean = true
): MapGeoJSONFeature[] | undefined => {
  const overlayId = overlayIdOf(useMapControlsStore.getState().mapOptions.paintBy);
  const {mapDocument} = useMapStore.getState();
  if (!map || !overlayId || !mapDocument) return;
  const areaIds = [
    ...new Set(
      map
        .queryRenderedFeatures(boxAroundPoint(e, brushSize), {
          layers: [`overlay-click-${overlayId}`],
        })
        .map(f => String(f.id))
    ),
  ].sort();
  if (!areaIds.length) return;

  const {mapMode} = useMapControlsStore.getState();
  const {shatterIds} =
    mapMode === MAP_MODES.COI ? useCoiAssignmentsStore.getState() : useAssignmentsStore.getState();
  const key = `${mapDocument.document_id}|${mapMode}|${overlayId}|${areaIds.join(',')}`;
  if (key !== lastKey || shatterIds !== lastShatterIds) {
    const areas = areaIds.flatMap(id => queryAreaFeatures(map, overlayId, id));
    const areaBoxes = areas.map(a => bbox(a));
    // querySourceFeatures leaves source/sourceLayer unset; painting reads them.
    const queryUnits = (sourceLayer: string) =>
      map
        .querySourceFeatures(BLOCK_SOURCE_ID, {sourceLayer})
        .map(f => Object.assign(f, {source: BLOCK_SOURCE_ID, sourceLayer}));
    const parents = queryUnits(mapDocument.parent_layer);
    // Child tiles hold every block; only broken units' blocks are paintable.
    const children =
      mapDocument.child_layer && shatterIds.children.size
        ? queryUnits(mapDocument.child_layer).filter(f => shatterIds.children.has(String(f.id)))
        : [];
    lastUnits = fastUniqBy([...parents, ...children], 'id').filter(unit => {
      const unitBox = bbox(unit);
      return areaBoxes.some(box => bboxesOverlap(box, unitBox)) && isMostlyInside(unit, areas);
    }) as MapGeoJSONFeature[];
    lastKey = key;
    lastShatterIds = shatterIds;
  }
  return filterFeatures({_features: lastUnits, filterLocked});
};
