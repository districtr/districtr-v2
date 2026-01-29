import {
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  MapGeoJSONFeature,
  Map as MaplibreMap,
} from 'maplibre-gl';
import {BLOCK_HOVER_LAYER_ID} from '@/app/constants/layers';
import {filterFeatures} from '@utils/map/filterFeatures';
import {demographyCache} from '../demography/demographyCache';

/**
 * getFeaturesIntersectingCounties
 * Get the features intersecting counties on the map.
 * @param map - MaplibreMap | null, the maplibre map instance
 * @param e - MapLayerMouseEvent | MapLayerTouchEvent, the event object
 * @param brushSize - number, the size of the brush
 * @returns MapGeoJSONFeature[] | undefined - An array of map features or undefined
 */
export const getFeaturesIntersectingCounties = (
  map: MaplibreMap | null,
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  brushSize: number,
  layers: string[] = [BLOCK_HOVER_LAYER_ID]
): MapGeoJSONFeature[] | undefined => {
  if (!map) return;

  const countyFeatures = map.queryRenderedFeatures(e.point, {
    layers: ['counties_fill'],
  });

  if (!countyFeatures?.length) return;
  const fips = countyFeatures[0].properties.STATEFP + countyFeatures[0].properties.COUNTYFP;
  return filterFeatures({
    _features: demographyCache.getFiltered(fips),
    filterLocked: true,
  });
};
