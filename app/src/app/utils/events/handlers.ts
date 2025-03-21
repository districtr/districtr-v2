import {MapGeoJSONFeature} from 'maplibre-gl';
import {MapRef} from 'react-map-gl/maplibre';
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
  map: MapRef | null,
  mapStoreRef: MapStore,
  sourceLayer: string
) => {
  if (map && Object.keys(mapStoreRef.zoneAssignments).length) {
    map.removeFeatureState({
      source: sourceLayer,
      sourceLayer: sourceLayer,
    });

    mapStoreRef.setAccumulatedGeoids(new Set());
    // reset zoneAssignments
    mapStoreRef.resetZoneAssignments();
    // confirm the map has been reset
    mapStoreRef.setFreshMap(false);
  }
};
