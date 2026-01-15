import {BLOCK_SOURCE_ID} from '@/app/constants/layers';
import {MapRef} from 'react-map-gl/maplibre';
import {MapStore} from '@/app/store/mapStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';

/**
 * Resets the selection status of the map to be able to clear all and start over.
 *
 * @param map - Map | null
 * @param mapStoreRef - MapStore
 */
export const ResetMapSelectState = (
  map: MapRef | null,
  _mapStoreRef: MapStore,
  sourceLayer: string
) => {
  const {zoneAssignments, resetZoneAssignments} = useAssignmentsStore.getState();
  if (map && zoneAssignments.size) {
    map.removeFeatureState({
      source: BLOCK_SOURCE_ID,
      sourceLayer: sourceLayer,
    });
    // reset zoneAssignments
    resetZoneAssignments();
    // confirm the map has been reset
  }
};
