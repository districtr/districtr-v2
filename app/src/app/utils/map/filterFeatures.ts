import {MapGeoJSONFeature} from 'maplibre-gl';
import {fastUniqBy} from '../arrays';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {MapStore} from '@/app/store/mapStore';

/**
 * filterFeatures
 * Filters the provided features based on certain criteria, such as locked features and captive IDs.
 *
 * @param {MapGeoJSONFeature[]} features - An array of features to be filtered.
 * @param {boolean} [filterLocked=true] - A flag indicating whether to filter out locked features.
 * @returns {MapGeoJSONFeature[]} - An array of filtered features.
 *
 * @description
 * This function applies multiple filtering criteria to the input features:
 * 1. If captive IDs are present in the state, filters out features that are in the captive IDs set.
 * 2. Optionally filters out features that are in the locked features set.
 * 3. If the map document has a child layer and there are parent shatter IDs, it will:
 *    - Exclude parent features from the results.
 *    - Track parent IDs that need to be healed.
 *
 * The function returns an array of features that pass all the filtering criteria.
 */
export const filterFeatures = (
  _features: MapGeoJSONFeature[],
  filterLocked: boolean = true,
  additionalFilters: Array<(f: MapGeoJSONFeature) => boolean> = [],
  allowOutsideCaptiveIds: boolean = false
) => {
  // first, dedupe
  const features: MapGeoJSONFeature[] = fastUniqBy(_features, 'id');
  const {captiveIds, mapDocument} = useMapStore.getState();
  const {mapOptions, selectedZone, activeTool} = useMapControlsStore.getState();
  const {zoneAssignments, shatterIds} = useAssignmentsStore.getState();
  const filterFunctions: Array<(f: MapGeoJSONFeature) => boolean> = [...additionalFilters];
  if (captiveIds.size && !allowOutsideCaptiveIds) {
    filterFunctions.push(f => captiveIds.has(f.id?.toString() || ''));
  }
  if (filterLocked) {
    if (activeTool === 'brush' && mapOptions.lockPaintedAreas.includes(selectedZone)) {
      return [];
    } else if (mapOptions.lockPaintedAreas.length) {
      const lockedAreas = mapOptions.lockPaintedAreas;
      filterFunctions.push(
        f => !lockedAreas.includes(zoneAssignments.get(f.id?.toString() || '') || null)
      );
    }
  }
  if (mapDocument?.child_layer && shatterIds.parents.size) {
    filterFunctions.push(f => {
      const id = f.id?.toString();
      if (!id) return false;
      const isParent = shatterIds.parents.has(id);
      if (isParent) {
        // check if parent IDs have been painted solid
        // don't paint parents with children
        return false;
      } else {
        // do paint everything else
        return true;
      }
    });
  }

  if (!filterFeatures.length) return features;

  const filteredFeatures = features.filter(feature => {
    return filterFunctions.every(f => f(feature));
  });
  return filteredFeatures;
};
