import {debounce} from 'lodash';
import {patchUpdates} from '../utils/api/mutations';
import {useMapStore as _useMapStore, MapStore} from './mapStore';
import {shallowCompareArray} from '../utils/helpers';
import {updateAssignments} from '../utils/api/queries';
import {queryClient} from '../utils/api/queryClient';
import { Assignment } from '../utils/api/apiHandlers';

const updateZones = ({
    getMapRef,
    assignments,
    appLoadingState
}: {
    getMapRef: MapStore['getMapRef'];
    assignments: Assignment[];
    appLoadingState: MapStore['appLoadingState'];
}) => {
    const isMutating = queryClient.isMutating();
    if (!isMutating && getMapRef?.() && assignments?.length && appLoadingState === 'loaded') {
        patchUpdates.mutate(assignments);
    }
};

export const getMapEditSubs = (useMapStore: typeof _useMapStore) => {
  const sendZoneUpdatesOnUpdate = useMapStore.subscribe<
    [MapStore['assignmentsHash'], MapStore['selectedZone'], MapStore['accumulatedGeoids'], MapStore['mapDocument'], MapStore['appLoadingState']]
  >(
    state => [state.assignmentsHash, state.selectedZone, state.accumulatedGeoids, state.mapDocument, state.appLoadingState],
    ([assignmentsHash, selectedZone, accumulatedGeoids, mapDocument, appLoadingState], [_, __, ___, ____, previousAppLoadingState]) => {
      // TODO: REMOVE BEFORE MERGING
      console.debug("hello world", assignmentsHash, selectedZone, accumulatedGeoids, mapDocument, appLoadingState, previousAppLoadingState)
      console.debug("hello world", previousAppLoadingState !== 'loaded', !(mapDocument && mapDocument.document_id !== undefined))
      if (!(mapDocument && mapDocument.document_id !== undefined)) return;
      const {getMapRef} = useMapStore.getState();
      let assignments: Assignment[] = Array.from(accumulatedGeoids).map(geoid => ({
        document_id: mapDocument.document_id,
        geo_id: geoid,
        zone: selectedZone,
      }));
      updateZones({getMapRef, assignments, appLoadingState});
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
