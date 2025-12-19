import {AssignmentsStore, ZoneAssignmentsMap} from '@/app/store/assignmentsStore';
import {MapStore} from '@/app/store/mapStore';
import {BLOCK_SOURCE_ID} from '@/app/constants/layers';

/**
 * resetZoneColors
 * Resets the zone colors for the specified feature IDs on the map.
 *
 * This function sets the feature state for each ID in the provided set or array to indicate that
 * the zone color should be reset. It checks if the map document is available and determines
 * the appropriate source layer based on the existence of child layers and shatter IDs.
 *
 * @param {Set<string> | string[]} ids - A set or array of feature IDs for which to reset the zone colors.
 * @param {ReturnType<MapStore['getMapRef']>} mapRef - The maplibre map instance used to set the feature state.
 * @param {MapStore['mapDocument']} mapDocument - The map document containing layer information.
 * @param {AssignmentsStore['shatterIds']} shatterIds - The shatter IDs used to determine layer types.
 */
export const resetZoneColors = ({
  ids,
  zoneAssignments,
  mapRef,
  mapDocument,
  shatterIds,
}: {
  ids?: Set<string> | string[];
  zoneAssignments?: ZoneAssignmentsMap;
  mapRef: ReturnType<MapStore['getMapRef']>;
  mapDocument: MapStore['mapDocument'];
  shatterIds: AssignmentsStore['shatterIds'];
}) => {
  const idsToReset = ids
    ? Array.from(ids)
    : zoneAssignments
      ? Array.from(zoneAssignments.keys())
      : null;
  if (!mapDocument || !mapRef || !idsToReset) return;
  const childLayerExists = mapDocument?.child_layer;
  const shatterIdsExist = shatterIds.parents.size;
  const getSourceLayer =
    childLayerExists && shatterIdsExist
      ? (id: string) => {
          return shatterIds.children.has(id) ? mapDocument.child_layer! : mapDocument.parent_layer;
        }
      : (_: string) => mapDocument.parent_layer;
  idsToReset.forEach(id => {
    const sourceLayer = getSourceLayer(id);
    mapRef?.setFeatureState(
      {
        source: BLOCK_SOURCE_ID,
        id,
        sourceLayer,
      },
      {
        selected: true,
        zone: null,
      }
    );
  });
};
