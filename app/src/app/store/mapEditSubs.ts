import {debounce} from 'lodash';
import {Assignment, FormatAssignments, getAssignments} from '../utils/api/apiHandlers';
import {patchUpdates} from '../utils/api/mutations';
import {useMapStore as _useMapStore, MapStore} from './mapStore';
import {checkIfSameZone, shallowCompareArray} from '../utils/helpers';
import {updateAssignments} from '../utils/api/queries';

const zoneUpdates = ({getMapRef, zoneAssignments, appLoadingState}: Partial<MapStore>) => {
  if (getMapRef?.() && zoneAssignments?.size && appLoadingState === 'loaded') {
    console.log('!!!UPDATING ZONES');
    const assignments = FormatAssignments();
    patchUpdates.mutate(assignments);
  }
};

const debouncedZoneUpdate = debounce(zoneUpdates, 25);

type zoneSubState = [MapStore['zoneAssignments'], MapStore['appLoadingState']];
export const getMapEditSubs = (useMapStore: typeof _useMapStore) => {
  const sendZoneUpdatesOnUpdate = useMapStore.subscribe(
    state => state.zoneAssignments,
    zoneAssignments => {
      const {getMapRef, appLoadingState} = useMapStore.getState();

      debouncedZoneUpdate({getMapRef, zoneAssignments, appLoadingState});
    }
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

  return [sendZoneUpdatesOnUpdate, fetchAssignmentsSub, healAfterEdits];
};
