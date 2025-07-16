import {debounce} from 'lodash';
import {saveColorScheme} from '../utils/api/apiHandlers/saveColorScheme';
import {FormatAssignments} from '../utils/api/apiHandlers/formatAssignments';
import {patchUpdates} from '../utils/api/mutations';
import {useMapStore as _useMapStore, MapStore} from './mapStore';
import {shallowCompareArray} from '../utils/helpers';
import GeometryWorker from '../utils/GeometryWorker';
import {demographyCache} from '../utils/demography/demographyCache';
import {getAssignments} from '../utils/api/apiHandlers/getAssignments';
import {useGeometryWorkerStore as _useGeometryWorkerStore} from './geometryWorkerStore';
import {proxy as comlinkProxy} from 'comlink';
// allowSendZoneUpdates will be set to false to prevent additional zoneUpdates calls from occurring
// when shattering/healing vtds during an undo/redo operation.
// We want to prevent intermediary state changes from being sent to the backend.
let allowSendZoneUpdates = true;

const zoneUpdates = ({getMapRef, zoneAssignments, appLoadingState}: Partial<MapStore>) => {
  // locked during break or heal
  const {mapLock, mapDocument, mapStatus, lastUpdatedHash, userID} = _useMapStore.getState();
  const document_id = mapDocument?.document_id;
  if (
    !mapLock &&
    getMapRef?.() &&
    zoneAssignments?.size &&
    appLoadingState === 'loaded' &&
    document_id &&
    mapStatus?.access === 'edit'
  ) {
    const assignments = FormatAssignments();
    if (assignments.length) {
      patchUpdates.mutate({assignments, updateHash: lastUpdatedHash, userID: userID});
    }
  }
};

const debouncedZoneUpdate = debounce(zoneUpdates, 500);

export const getMapEditSubs = (
  useMapStore: typeof _useMapStore,
  useGeometryWorkerStore: typeof _useGeometryWorkerStore
) => {
  // Set callback for geometry worker
  const setGeometry = useGeometryWorkerStore.getState().setGeometry;
  GeometryWorker?.setSendDataCallback(comlinkProxy(setGeometry));

  const sendZoneUpdatesOnUpdate = useMapStore.subscribe<
    [MapStore['zoneAssignments'], MapStore['appLoadingState']]
  >(
    state => [state.zoneAssignments, state.appLoadingState],
    ([zoneAssignments, appLoadingState], [_, previousAppLoadingState]) => {
      if (appLoadingState === 'blurred' || !allowSendZoneUpdates) return;
      // Update GeometryWorker on first render
      const zoneEntries = Array.from(useMapStore.getState().zoneAssignments.entries());
      GeometryWorker?.updateZones(zoneEntries as [string, number][]);
      // Update caches / workers
      demographyCache.updatePopulations(zoneAssignments);
      // If previously not loaded, this is the initial render
      if (previousAppLoadingState !== 'loaded') return;
      const {getMapRef} = useMapStore.getState();
      debouncedZoneUpdate({getMapRef, zoneAssignments, appLoadingState});
    },
    {equalityFn: shallowCompareArray}
  );

  const fetchAssignmentsSub = useMapStore.subscribe(
    state => state.mapDocument,
    (curr, prev) => {
      const {loadZoneAssignments, setErrorNotification} = useMapStore.getState();
      if (curr === prev) return;
      const isInitialDocument = !prev;
      const remoteHasUpdated =
        curr?.updated_at &&
        prev?.updated_at &&
        new Date(curr.updated_at) > new Date(prev.updated_at);
      const mapDocumentChanged = curr?.document_id !== prev?.document_id;
      if (isInitialDocument || remoteHasUpdated || mapDocumentChanged) {
        getAssignments(curr).then(data => {
          if (data === null) {
            setErrorNotification({
              severity: 2,
              id: 'assignments-not-found',
              message: 'Assignments not found',
            });
          } else {
            loadZoneAssignments(data);
          }
        });
      }
    }
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

  const updateGeometryWorkerState = useMapStore.subscribe(
    state => state.shatterIds,
    curr => {
      GeometryWorker?.handleShatterHeal({
        parents: Array.from(curr.parents),
        children: Array.from(curr.children),
      });
    }
  );

  const lockMapOnShatterIdChange = useMapStore.subscribe<
    [MapStore['shatterIds']['parents'], MapStore['appLoadingState']]
  >(
    state => [state.shatterIds.parents, state.appLoadingState],
    (curr, prev) => {
      const isTemporalAction = useMapStore.getState().isTemporalAction;
      if (!isTemporalAction) return;
      const appLoadingState = prev[1];
      const [shatterIds, pastShatterIds] = [curr[0], prev[0]];
      let shatterIdsChanged = shatterIds.size !== pastShatterIds.size;
      if (!shatterIdsChanged) {
        shatterIds.forEach(v => {
          if (!pastShatterIds.has(v)) {
            shatterIdsChanged = true;
          }
        });
        pastShatterIds.forEach(v => {
          if (!shatterIds.has(v)) {
            shatterIdsChanged = true;
          }
        });
      }
      if (appLoadingState === 'loaded' && shatterIdsChanged) {
        allowSendZoneUpdates = false;
        const addedIds = (shatterIds as any).difference(pastShatterIds);
        const removedIds = (pastShatterIds as any).difference(shatterIds);
        if (addedIds.size) {
          const {mapDocument, silentlyShatter} = useMapStore.getState();
          if (!mapDocument) {
            allowSendZoneUpdates = true;
            return;
          }
          silentlyShatter(mapDocument.document_id, Array.from(addedIds)).then(r => {
            allowSendZoneUpdates = true;
          });
        } else if (removedIds.size) {
          const {mapDocument, silentlyHeal} = useMapStore.getState();
          if (!mapDocument) {
            allowSendZoneUpdates = true;
            return;
          }
          silentlyHeal(mapDocument.document_id, Array.from(removedIds)).then(() => {
            allowSendZoneUpdates = true;
          });
        } else {
          allowSendZoneUpdates = true;
        }
      }
    }
  );
  const _addColorSchemeSub = useMapStore.subscribe<MapStore['colorScheme']>(
    state => state.colorScheme,
    colorScheme => {
      const {mapDocument, mapStatus} = useMapStore.getState();
      if (mapDocument && mapStatus?.access === 'edit') {
        console.log('Color scheme updating:', colorScheme, mapStatus);
        saveColorScheme({document_id: mapDocument.document_id, colors: colorScheme});
      }
    },
    {equalityFn: shallowCompareArray}
  );

  return [
    sendZoneUpdatesOnUpdate,
    fetchAssignmentsSub,
    healAfterEdits,
    lockMapOnShatterIdChange,
    updateGeometryWorkerState,
    _addColorSchemeSub,
  ];
};
