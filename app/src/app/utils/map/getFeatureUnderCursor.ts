import {
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  MapGeoJSONFeature,
  Map as MaplibreMap,
} from 'maplibre-gl';
import {BLOCK_HOVER_LAYER_ID} from '@/app/constants/layers';
import {filterFeatures} from '@utils/map/filterFeatures';

/**
 * getFeatureUnderCursor
 * Get the feature under the cursor on the map.
 * @param map - MaplibreMap | null, the maplibre map instance
 * @param e - MapLayerMouseEvent | MapLayerTouchEvent, the event object
 * @param brushSize - number, the size of the brush
 * @returns MapGeoJSONFeature | undefined - A map feature or undefined
 */
export const getFeatureUnderCursor = (
  map: MaplibreMap | null,
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  brushSize: number,
  layers: string[] = [BLOCK_HOVER_LAYER_ID]
): MapGeoJSONFeature[] | undefined => {
  return filterFeatures(map?.queryRenderedFeatures(e.point, {layers}) || [], true, undefined, true);
};
