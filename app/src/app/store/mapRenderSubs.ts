import {
  PARENT_LAYERS,
  CHILD_LAYERS,
  getLayerFill,
  COUNTY_LAYERS,
} from '../constants/layers';
import {
  ColorZoneAssignmentsState,
  colorZoneAssignments,
  shallowCompareArray,
} from '../utils/helpers';
import {useMapStore as _useMapStore, MapStore} from '@store/mapStore';

export const getRenderSubscriptions = (useMapStore: typeof _useMapStore) => {
  const _zoneAssignmentMapSideEffectRender = useMapStore.subscribe<ColorZoneAssignmentsState>(
    state => [
      state.zoneAssignments,
      state.mapDocument,
      state.getMapRef,
      state.shatterIds,
      state.appLoadingState,
      state.mapRenderingState,
      state.mapOptions.lockPaintedAreas,
    ],
    (curr, prev) => {
      colorZoneAssignments(curr, prev);
      const {
        getMapRef,
        setLockedFeatures,
        lockedFeatures,
        mapRenderingState,
      } = useMapStore.getState();
      const mapRef = getMapRef();
      if (!mapRef || mapRenderingState !== 'loaded') return;
      const [lockPaintedAreas, prevLockPaintedAreas] = [curr[6], prev[6]];
      const sameLockedAreas =
        JSON.stringify(lockPaintedAreas) === JSON.stringify(prevLockPaintedAreas);
      const zoneAssignments = curr[0];
      // if lockPaintedAreas, lock all zones
      if (lockPaintedAreas === true) {
        const nonNullZones = new Set(
          [...zoneAssignments.entries()]
            .filter(([key, value]) => value !== null)
            .map(([key]) => key)
        );
        setLockedFeatures(nonNullZones);
        // now unlocked, was previously locked
      } else if (Array.isArray(lockPaintedAreas)) {
        const previousWasArray = Array.isArray(prevLockPaintedAreas);
        const nonNullZones = new Set(
          [...zoneAssignments.entries()]
            .filter(
              ([key, value]) =>
                // locked zones include assignment zone
                lockPaintedAreas.includes(value) ||
                // locked zones are the same, and this individual feature was previously locked
                (sameLockedAreas && lockedFeatures.has(key)) ||
                // locked zones are changed, BUT this individual feature is not in a zone
                // that was previously locked
                (!sameLockedAreas &&
                  previousWasArray &&
                  !lockPaintedAreas.includes(value) &&
                  !prevLockPaintedAreas.includes(value) &&
                  lockedFeatures.has(key))
            )
            .map(([key]) => key)
        );
        setLockedFeatures(nonNullZones);
      } else if (!lockPaintedAreas && prevLockPaintedAreas) {
        setLockedFeatures(new Set());
      }
    },
    {equalityFn: shallowCompareArray}
  );

  const lockFeaturesSub = useMapStore.subscribe(
    state => state.lockedFeatures,
    (lockedFeatures, previousLockedFeatures) => {
      const {getMapRef, shatterIds, mapDocument} = useMapStore.getState();
      const mapRef = getMapRef();
      if (!mapRef || !mapDocument) return;

      const getLayer = (id: string) => {
        const isChild = shatterIds.children.has(id);
        if (isChild && mapDocument.child_layer) {
          return mapDocument.child_layer;
        }
        return mapDocument.parent_layer;
      };

      lockedFeatures.forEach(id => {
        if (!previousLockedFeatures.has(id)) {
          mapRef.setFeatureState(
            {
              id,
              source: mapDocument.gerrydb_table,
              sourceLayer: getLayer(id),
            },
            {
              locked: true,
            }
          );
        }
      });

      previousLockedFeatures.forEach(id => {
        if (!lockedFeatures.has(id)) {
          mapRef.setFeatureState(
            {
              id,
              source: mapDocument.gerrydb_table,
              sourceLayer: getLayer(id),
            },
            {
              locked: false,
            }
          );
        }
      });
    }
  );

  const filterCountiesSub = useMapStore.subscribe<[string | undefined, MapStore['getMapRef']]>(
    state => [state.mapOptions.currentStateFp, state.getMapRef],
    ([stateFp, getMapRef]) => {
      const mapRef = getMapRef();
      if (!mapRef) return;
      const filterExpression = (stateFp ? ['==', 'STATEFP', stateFp] : true) as any;
      COUNTY_LAYERS.forEach(layer => {
        mapRef.getLayer(layer) && mapRef.setFilter(layer, ['any', filterExpression]);
      });
    }
  );

  return [_zoneAssignmentMapSideEffectRender, lockFeaturesSub, filterCountiesSub];
};
