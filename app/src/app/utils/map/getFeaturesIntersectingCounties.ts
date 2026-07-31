import {
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  MapGeoJSONFeature,
  Map as MaplibreMap,
} from 'maplibre-gl';
import {BLOCK_HOVER_LAYER_ID} from '@/app/constants/map/layerIds';
import {boxAroundPoint} from '@utils/map/bboxAroundPoint';
import {filterFeatures} from '@utils/map/filterFeatures';
import {fastUniqBy} from '@utils/arrays';
import {demographyService} from '../demography/demographyService';

/**
 * Module-scoped memo of the last computed result, keyed by the sorted set of
 * county FIPS codes under the brush. Consecutive mousemove events over the
 * same set of counties (the common case while dragging) skip the
 * demography lookup + filterFeatures pass entirely.
 */
let lastCountyKey: string | null = null;
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
    lastCountyKey = null;
    lastResult = undefined;
    return;
  }

  const distinctCounties = fastUniqBy(
    countyFeatures.map(feature => ({
      fips: `${feature.properties.STATEFP}${feature.properties.COUNTYFP}`,
    })),
    'fips'
  );

  const countyKey = distinctCounties
    .map(({fips}) => fips)
    .sort()
    .join(',');

  if (countyKey === lastCountyKey) {
    return lastResult;
  }
  lastCountyKey = countyKey;

  const blockFeatures = distinctCounties.flatMap(({fips}) => demographyService.getFiltered(fips));

  lastResult = filterFeatures({
    _features: blockFeatures,
    filterLocked,
  });
  return lastResult;
};
