import {MapGeoJSONFeature} from 'maplibre-gl';
import {fastUniqBy} from '../arrays';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {booleanIntersects, area, intersect} from '@turf/turf';
import {MultiPolygon, Polygon} from 'geojson';

const MINIMUM_INTERSECTION_AREA_RATIO = 0.25;
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
export const filterFeatures = ({
  _features,
  filterLocked = true,
  additionalFilters = [],
  allowOutsideCaptiveIds = false,
  filterOverlayFeatures = true,
}: {
  _features: MapGeoJSONFeature[];
  filterLocked?: boolean;
  additionalFilters?: Array<(f: MapGeoJSONFeature) => boolean>;
  allowOutsideCaptiveIds?: boolean;
  filterOverlayFeatures?: boolean;
}) => {
  // first, dedupe
  const features: MapGeoJSONFeature[] = fastUniqBy(_features, 'id');
  const {captiveIds, mapDocument} = useMapStore.getState();
  const {mapOptions, selectedZone, activeTool} = useMapControlsStore.getState();
  const {zoneAssignments, shatterIds} = useAssignmentsStore.getState();
  const {paintConstraint, _idCache} = useOverlayStore.getState();
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
  if (filterOverlayFeatures && paintConstraint) {
    filterFunctions.push(f => {
      if (!f.id) return false;
      if (_idCache.has(f.id.toString())) {
        return _idCache.get(f.id.toString()) ?? false;
      } else {
        let intersected = false;
        if (f.geometry.type === 'Point') {
          intersected = paintConstraint.features.some(constraintFeature =>
            booleanIntersects(constraintFeature.geometry, f.geometry)
          );
        } else {
          const geomArea = area(f.geometry);
          let clippedArea = 0;
          for (const constraintFeature of paintConstraint.features) {
            const clipped = intersect({
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  geometry: constraintFeature.geometry as Polygon | MultiPolygon,
                  properties: {},
                },
                {
                  type: 'Feature',
                  geometry: f.geometry as Polygon | MultiPolygon,
                  properties: {},
                },
              ],
            });
            if (clipped) {
              clippedArea += area(clipped.geometry);
              intersected = clippedArea / geomArea > MINIMUM_INTERSECTION_AREA_RATIO;
            }
            if (intersected) {
              break;
            }
          }
        }
        _idCache.set(f.id.toString(), intersected);
        return intersected;
      }
    });
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
