import {debounce} from 'lodash';
import {FormatAssignments} from '../utils/api/apiHandlers';
import {patchUpdates} from '../utils/api/mutations';
import {useMapStore as _useMapStore, MapStore} from './mapStore';
import {shallowCompareArray} from '../utils/helpers';
import {updateAssignments} from '../utils/api/queries';

// allowSendZoneUpdates will be set to false to prevent additional zoneUpdates calls from occurring
// when shattering/healing vtds during an undo/redo operation.
// We want to prevent intermediary state changes from being sent to the backend.
let allowSendZoneUpdates = true

const zoneUpdates = ({getMapRef, zoneAssignments, appLoadingState}: Partial<MapStore>) => {
  // locked during break or heal
  const mapIsLocked = _useMapStore.getState().mapLock;
  if (!mapIsLocked && getMapRef?.() && zoneAssignments?.size && appLoadingState === 'loaded') {
    const assignments = FormatAssignments();
    patchUpdates.mutate(assignments);
  }
};

const debouncedZoneUpdate = debounce(zoneUpdates, 1000);

export const getMapEditSubs = (useMapStore: typeof _useMapStore) => {
  const sendZoneUpdatesOnUpdate = useMapStore.subscribe<
    [MapStore['zoneAssignments'], MapStore['appLoadingState']]
  >(
    state => [state.zoneAssignments, state.appLoadingState],
    ([zoneAssignments, appLoadingState], [_, previousAppLoadingState]) => {
      if (previousAppLoadingState !== 'loaded' || appLoadingState === 'blurred' || !allowSendZoneUpdates) return;
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

  const lockMapOnShatterIdChange = useMapStore.subscribe<[MapStore['shatterIds']['parents'], MapStore['appLoadingState']]>(
    state => [state.shatterIds.parents, state.appLoadingState],
    (curr, prev) => {
      const isTemporalAction = useMapStore.getState().isTemporalAction
      if (!isTemporalAction) return
      const appLoadingState = prev[1]
      const [shatterIds, pastShatterIds] = [curr[0], prev[0]]
      let shatterIdsChanged = shatterIds.size !== pastShatterIds.size
      if (!shatterIdsChanged) {
        shatterIds.forEach((v) => {
          if (!pastShatterIds.has(v)) {
            shatterIdsChanged = true
          }
        })
        pastShatterIds.forEach((v) => {
          if (!shatterIds.has(v)) {
            shatterIdsChanged = true
          }
        })
      }
      if (appLoadingState === 'loaded' && shatterIdsChanged) {
        allowSendZoneUpdates = false
        const addedIds = (shatterIds as any).difference(pastShatterIds)
        const removedIds = (pastShatterIds as any).difference(shatterIds)
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

  return [sendZoneUpdatesOnUpdate, fetchAssignmentsSub, healAfterEdits, lockMapOnShatterIdChange];
};
