import {Map as MaplibreMap} from 'maplibre-gl';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerIds';
import {ColorZoneAssignmentsState} from './types';
import {useMapStore} from '@/app/store/mapStore';
import {APP_LOADING_STATES} from '@constants/document/state';
import {RENDERING_STATES} from '@constants/map/renderingState';

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
  const isInitialRender =
    previousState?.[3] !== APP_LOADING_STATES.LOADED ||
    previousState?.[4] !== RENDERING_STATES.LOADED;
  if (
    !mapRef || // map does not exist
    !mapDocument || // map document is not loaded
    appLoadingState !== APP_LOADING_STATES.LOADED || // app was blurred, loading, or temporal state was mutatated
    mapRenderingState !== RENDERING_STATES.LOADED // map layers are not loaded
  ) {
    return false;
  }
  const featureStateCache = mapRef.style.sourceCaches?.[BLOCK_SOURCE_ID]?._state?.state;
  const featureStateChangesCache =
    mapRef.style.sourceCaches?.[BLOCK_SOURCE_ID]?._state?.stateChanges;
  const source = mapRef.getSource(BLOCK_SOURCE_ID) as {type?: string} | undefined;
  const useVectorSourceLayer = source?.type === 'vector';
  // GeoJSON sources (public maps) use property-based styling via ZONE_LABEL_STYLE,
  // so feature-state zone coloring is not needed — skip and report success.
  if (!useVectorSourceLayer) return true;
  if (!featureStateCache) return false;

  zoneAssignments.forEach((zone, id) => {
    if (!id) return;
    const isChild = useVectorSourceLayer && currentShatterIds.children.has(id);
    const parentChildLayer = isChild ? mapDocument.child_layer : mapDocument.parent_layer;
    const sourceLayer = useVectorSourceLayer && parentChildLayer ? parentChildLayer : undefined;
    const sourceLayerStateKey = sourceLayer ?? '';
    const featureState = featureStateCache?.[sourceLayerStateKey]?.[id];
    const futureState = featureStateChangesCache?.[sourceLayerStateKey]?.[id];
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
    const isChild = useVectorSourceLayer && prevShatterIds?.children.has(id);
    const parentChildLayer = isChild ? mapDocument.child_layer : mapDocument.parent_layer;
    const sourceLayer = useVectorSourceLayer && parentChildLayer ? parentChildLayer : undefined;
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
  return true;
};
