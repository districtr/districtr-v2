import {Map as MaplibreMap} from 'maplibre-gl';
import {BLOCK_SOURCE_ID} from '@/app/constants/layers';
import {ColorZoneAssignmentsState} from './types';
import {useMapStore} from '@/app/store/mapStore';

/**
 * Assigns colors to zones on the map based on the current zone assignments.
 * This function updates the feature state of map features to reflect their assigned zones.
 *
 * @function
 * @name colorZoneAssignments
 * @returns {void}
 *
 * @requires useMapStore
 * @requires BLOCK_SOURCE_ID
 *
 * @description
 * This function does the following:
 * 1. Retrieves the current state from the map store.
 * 2. Checks if the map reference and map document are available.
 * 3. Iterates through the zone assignments.
 * 4. Determines whether each assignment is for a parent or child layer.
 * 5. Sets the feature state for each assigned feature on the map.
 */
export const colorZoneAssignments = (
  mapRef: MaplibreMap,
  state: ColorZoneAssignmentsState,
  previousState?: ColorZoneAssignmentsState
) => {
  const [zoneAssignments, mapDocument, currentShatterIds, appLoadingState, mapRenderingState] =
    state;
  const [previousZoneAssignments, prevShatterIds] = [
    previousState?.[0] || new Map(),
    previousState?.[2] || null,
  ];
  const isInitialRender = previousState?.[3] !== 'loaded' || previousState?.[4] !== 'loaded';
  if (
    !mapRef || // map does not exist
    !mapDocument || // map document is not loaded
    appLoadingState !== 'loaded' || // app was blurred, loading, or temporal state was mutatated
    mapRenderingState !== 'loaded' // map layers are not loaded
  ) {
    return;
  }
  const featureStateCache = mapRef.style.sourceCaches?.[BLOCK_SOURCE_ID]?._state?.state;
  const featureStateChangesCache =
    mapRef.style.sourceCaches?.[BLOCK_SOURCE_ID]?._state?.stateChanges;
  if (!featureStateCache) return;

  zoneAssignments.forEach((zone, id) => {
    if (!id) return;
    const isChild = currentShatterIds.children.has(id);
    const sourceLayer = isChild ? mapDocument.child_layer : mapDocument.parent_layer;
    if (!sourceLayer) return;
    const featureState = featureStateCache?.[sourceLayer]?.[id];
    const futureState = featureStateChangesCache?.[sourceLayer]?.[id];
    if (!isInitialRender && (featureState?.zone === zone || futureState?.zone === zone)) return;

    mapRef?.setFeatureState(
      {
        source: BLOCK_SOURCE_ID,
        id,
        sourceLayer,
      },
      {
        selected: true,
        zone,
      }
    );
  });

  previousZoneAssignments.forEach((zone, id) => {
    if (zoneAssignments.get(id)) return;
    const isChild = prevShatterIds?.children.has(id);
    const sourceLayer = isChild ? mapDocument.child_layer : mapDocument.parent_layer;
    if (!sourceLayer) return;
    mapRef?.setFeatureState(
      {
        source: BLOCK_SOURCE_ID,
        id,
        sourceLayer,
      },
      {
        selected: false,
        zone: null,
      }
    );
  });
};
