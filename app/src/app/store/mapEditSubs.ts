import {debounce} from 'lodash';
import {FormatAssignments} from '../utils/api/apiHandlers';
import {patchUpdates} from '../utils/api/mutations';
import {useMapStore as _useMapStore, MapStore} from './mapStore';
import {shallowCompareArray} from '../utils/helpers';
import {updateAssignments} from '../utils/api/queries';
import {queryClient} from '../utils/api/queryClient';

const zoneUpdates = ({getMapRef, zoneAssignments, appLoadingState}: Partial<MapStore>) => {
  const isMutating = queryClient.isMutating();
  if (!isMutating && getMapRef?.() && zoneAssignments?.size && appLoadingState === 'loaded') {
    const assignments = FormatAssignments();
    patchUpdates.mutate(assignments);
  }
};

const debouncedZoneUpdate = debounce(zoneUpdates, 25);

export const getMapEditSubs = (useMapStore: typeof _useMapStore) => {
  const sendZoneUpdatesOnUpdate = useMapStore.subscribe<
    [MapStore['zoneAssignments'], MapStore['appLoadingState']]
  >(
    state => [state.zoneAssignments, state.appLoadingState],
    ([zoneAssignments, appLoadingState], [_, previousAppLoadingState]) => {
      if (previousAppLoadingState !== 'loaded') return;
      const {getMapRef} = useMapStore.getState();
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

  return [sendZoneUpdatesOnUpdate, fetchAssignmentsSub, healAfterEdits];
};
