import {
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  MapGeoJSONFeature,
  Map as MaplibreMap,
} from 'maplibre-gl';
import {BLOCK_HOVER_LAYER_ID} from '@/app/constants/map/layerIds';
import {boxAroundPoint} from '@utils/map/bboxAroundPoint';
import {filterFeatures, getFilterFeaturesState} from '@utils/map/filterFeatures';
import {demographyService} from '../demography/demographyService';

/**
 * Module-scoped memo of the last computed result. Consecutive mousemove events
 * over the same counties with unchanged filter state (the common case while
 * dragging; painting only touches accumulatedAssignments until mouseup) skip
 * the filterFeatures pass entirely.
 */
let lastDeps: unknown[] = [];
let lastResult: MapGeoJSONFeature[] | undefined;

/**
 * getFeaturesIntersectingCounties
 * Get the features intersecting the counties under the brush footprint,
 * so a brush that straddles a county line paints both counties' blocks
 * instead of only the county under the cursor point.
 * @param map - MaplibreMap | null, the maplibre map instance
 * @param e - MapLayerMouseEvent | MapLayerTouchEvent, the event object
 * @param brushSize - number, the size of the brush
 * @returns MapGeoJSONFeature[] | undefined - An array of map features or undefined
 */
export const getFeaturesIntersectingCounties = (
  map: MaplibreMap | null,
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  brushSize: number,
  _layers: string[] = [BLOCK_HOVER_LAYER_ID],
  filterLocked: boolean = true
): MapGeoJSONFeature[] | undefined => {
  if (!map) return;

  const bbox = boxAroundPoint(e, brushSize);
  const countyFeatures = map.queryRenderedFeatures(bbox, {
    layers: ['counties_fill'],
  });

  if (!countyFeatures?.length) {
    lastDeps = [];
    lastResult = undefined;
    return;
  }

  const fipsCodes = Array.from(
    new Set(countyFeatures.map(f => `${f.properties.STATEFP}${f.properties.COUNTYFP}`))
  ).sort();
  // getFiltered serves these arrays from a per-county cache that is cleared when
  // the demography table reloads (e.g. after a shatter), so their identity is a key too.
  const countyBlocks = fipsCodes.map(fips => demographyService.getFiltered(fips));

  // filterLocked is part of the key: the inspector writes unfiltered entries,
  // and a brush click at the same spot must not replay one onto locked units.
  const deps = [filterLocked, ...countyBlocks, ...Object.values(getFilterFeaturesState())];
  if (deps.length === lastDeps.length && deps.every((dep, i) => dep === lastDeps[i])) {
    return lastResult;
  }
  lastDeps = deps;

  lastResult = filterFeatures({
    _features: countyBlocks.flat(),
    filterLocked,
  });
  return lastResult;
};
