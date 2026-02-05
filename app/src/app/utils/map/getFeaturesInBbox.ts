import {
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  MapGeoJSONFeature,
  Map as MaplibreMap,
} from 'maplibre-gl';
import {BLOCK_HOVER_LAYER_ID, BLOCK_HOVER_LAYER_ID_CHILD} from '@/app/constants/layers';
import {boxAroundPoint} from '@utils/map/bboxAroundPoint';
import {filterFeatures} from '@utils/map/filterFeatures';
import {useMapStore} from '@/app/store/mapStore';

/**
 * getFeaturesInBbox
 * Get the features in a bounding box on the map.
 * @param map - Map | null, the maplibre map instance
 * @param e - MapLayerMouseEvent | MapLayerTouchEvent, the event object
 * @param brushSize - number, the size of the brush
 * @returns MapGeoJSONFeature[] | undefined - An array of map features or undefined
 */
export const getFeaturesInBbox = (
  map: MaplibreMap | null,
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  brushSize: number,
  _layers: string[] = [BLOCK_HOVER_LAYER_ID],
  filterLocked: boolean = true
): MapGeoJSONFeature[] | undefined => {
  const bbox = boxAroundPoint(e, brushSize);
  const {captiveIds} = useMapStore.getState();

  const layers = _layers?.length
    ? _layers
    : captiveIds.size
      ? [BLOCK_HOVER_LAYER_ID, BLOCK_HOVER_LAYER_ID_CHILD]
      : [BLOCK_HOVER_LAYER_ID];

  let features = map?.queryRenderedFeatures(bbox, {layers}) || [];
  return filterFeatures({
    _features: features,
    filterLocked,
  });
};
