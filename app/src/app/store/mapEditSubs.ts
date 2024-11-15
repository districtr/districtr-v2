import {debounce} from 'lodash';
import {FormatAssignments} from '../utils/api/apiHandlers';
import {patchUpdates} from '../utils/api/mutations';
import {useMapStore as _useMapStore, MapStore} from './mapStore';
import {shallowCompareArray} from '../utils/helpers';
import {updateAssignments} from '../utils/api/queries';
import {queryClient} from '../utils/api/queryClient';

let allowSendZoneUpdates = true

const zoneUpdates = ({getMapRef, zoneAssignments, appLoadingState}: Partial<MapStore>) => {
  const isMutating = queryClient.isMutating();
  if (!isMutating && getMapRef?.() && zoneAssignments?.size && appLoadingState === 'loaded') {
    const assignments = FormatAssignments();
    patchUpdates.mutate(assignments);
  }
};

const debouncedZoneUpdate = debounce(zoneUpdates, 25);

export const getMapEditSubs = (useMapStore: typeof _useMapStore) => {
  const lockMapOnShatterIdChange = useMapStore.subscribe<[MapStore['shatterIds']['parents'], MapStore['appLoadingState']]>(
    state => [state.shatterIds.parents, state.appLoadingState],
    (curr, prev) => {
      const isTemporalAction = useMapStore.getState().isTemporalAction
      if (!isTemporalAction) return
      const appLoadingState = prev[1]
      const [shatterIds, pastShatterIds] = [curr[0], prev[0]]
      console.log("!!!SHATTER IDS changed", shatterIds, pastShatterIds)
      if (appLoadingState === 'loaded' && shatterIds !== pastShatterIds) {
        console.log("LOCKING ZONE UPDATES!!!")
        allowSendZoneUpdates = false
        const addedIds = shatterIds.difference(pastShatterIds)
        const removedIds = pastShatterIds.difference(shatterIds)

        console.log("!!!SHATTER IDS add/remove", addedIds, removedIds)
        if (addedIds.size) {
          const {mapDocument, silentlyShatter} = useMapStore.getState()
          if (!mapDocument) {
            allowSendZoneUpdates = true
            return
          }
          silentlyShatter(mapDocument.document_id, Array.from(addedIds)).then((r) => {
            allowSendZoneUpdates = true
          })
        } else if (removedIds.size) {

          const {mapDocument, silentlyHeal} = useMapStore.getState()
          if (!mapDocument) {
            allowSendZoneUpdates = true
            return
          }
          silentlyHeal(mapDocument.document_id, Array.from(removedIds)).then(() => {
            allowSendZoneUpdates = true
          })
        } else {
          allowSendZoneUpdates = true
        }

      }
    }
  )
  const sendZoneUpdatesOnUpdate = useMapStore.subscribe<
    [MapStore['zoneAssignments'], MapStore['appLoadingState']]
  >(
    state => [state.zoneAssignments, state.appLoadingState],
    ([zoneAssignments, appLoadingState], [_, previousAppLoadingState]) => {
      if (previousAppLoadingState !== 'loaded' || !allowSendZoneUpdates) return;
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

  return [lockMapOnShatterIdChange, sendZoneUpdatesOnUpdate, fetchAssignmentsSub, healAfterEdits];
};
