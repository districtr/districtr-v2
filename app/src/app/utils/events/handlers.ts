import {BLOCK_SOURCE_ID} from '@/app/constants/layers';
import {Map, MapGeoJSONFeature} from 'maplibre-gl';
import {MapStore} from '@/app/store/mapStore';

const mapShatterableFeatures = (
  features: Array<MapGeoJSONFeature>,
  shatterMappings: MapStore['shatterMappings'],
  child_layer: string
) => {};

/**
 * Resets the selection status of the map to be able to clear all and start over.
 *
 * @param map - Map | null
 * @param mapStoreRef - MapStore
 */
export const ResetMapSelectState = (
  map: Map | null,
  mapStoreRef: MapStore,
  sourceLayer: string
) => {
  if (map && Object.keys(mapStoreRef.zoneAssignments).length) {
    map.removeFeatureState({
      source: BLOCK_SOURCE_ID,
      sourceLayer: sourceLayer,
    });

    mapStoreRef.setAccumulatedGeoids(new Set());
    // reset zoneAssignments
    mapStoreRef.resetZoneAssignments();
    // confirm the map has been reset
    mapStoreRef.setFreshMap(false);
  }
};
