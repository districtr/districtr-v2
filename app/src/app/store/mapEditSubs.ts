import {debounce} from 'lodash';
import {Assignment, FormatAssignments, getAssignments} from '../utils/api/apiHandlers';
import {patchUpdates} from '../utils/api/mutations';
import {useMapStore as _useMapStore, MapStore} from './mapStore';
import {checkIfSameZone, shallowCompareArray} from '../utils/helpers';
import {updateAssignments} from '../utils/api/queries';

const zoneUpdates = ({getMapRef, zoneAssignments, appLoadingState}: Partial<MapStore>) => {
  if (getMapRef?.() && zoneAssignments?.size && appLoadingState === 'loaded') {
    const assignments = FormatAssignments();
    patchUpdates.mutate(assignments);
  }
};
const debouncedZoneUpdate = debounce(zoneUpdates, 25);

type zoneSubState = [
  MapStore['getMapRef'],
  MapStore['zoneAssignments'],
  MapStore['appLoadingState'],
  MapStore['mapRenderingState'],
];
export const getMapEditSubs = (useMapStore: typeof _useMapStore) => {
  const sendZonesOnMapRefSub = useMapStore.subscribe<zoneSubState>(
    state => [
      state.getMapRef,
      state.zoneAssignments,
      state.appLoadingState,
      state.mapRenderingState,
    ],
    (
      [getMapRef, zoneAssignments, appLoadingState, mapRenderingState],
      [_prevMapRef, _prevZoneAssignments, prevAppLoadingState, prevMapRenderingState]
    ) => {
      const previousNotLoaded = [
        appLoadingState,
        mapRenderingState,
        prevAppLoadingState,
        prevMapRenderingState,
      ].some(state => state !== 'loaded');
      if (!getMapRef() || previousNotLoaded) {
        return;
      }
      debouncedZoneUpdate({getMapRef, zoneAssignments, appLoadingState});
    },
    {equalityFn: shallowCompareArray}
  );

  const fetchAssignmentsSub = useMapStore.subscribe(
    state => state.mapDocument,
    mapDocument => mapDocument && updateAssignments(mapDocument)
  );

  const healAfterEdits = useMapStore.subscribe<[MapStore['parentsToHeal'], MapStore['mapOptions']]>(
    state => [state.parentsToHeal, state.mapOptions],
    ([parentsToHeal, mapOptions]) => {
      const {processHealParentsQueue} = useMapStore.getState();
      if (parentsToHeal.length && mapOptions.mode === 'default') {
        processHealParentsQueue();
      }
    },
    {equalityFn: shallowCompareArray}
  );

  return [sendZonesOnMapRefSub, fetchAssignmentsSub, healAfterEdits];
};
