import {debounce} from 'lodash';
import {saveColorScheme} from '../utils/api/apiHandlers/saveColorScheme';
import {FormatAssignments} from '../utils/api/apiHandlers/formatAssignments';
import {useMapStore as _useMapStore, MapStore} from './mapStore';
import {shallowCompareArray} from '../utils/helpers';
import GeometryWorker from '../utils/GeometryWorker';
import {demographyCache} from '../utils/demography/demographyCache';
import {Assignment} from '@utils/api/apiHandlers/types';
import {idb} from '@utils/idb/idb';

// allowSendZoneUpdates will be set to false to prevent additional zoneUpdates calls from occurring
// when shattering/healing vtds during an undo/redo operation.
// We want to prevent intermediary state changes from being sent to the backend.
let allowSendZoneUpdates = true;

const updateIdbAssignments = (_document_id: string) => {
  const t0 = performance.now();
  // // locked during break or heal
  const {
    mapLock,
    mapDocument,
    mapStatus,
    appLoadingState,
    zoneAssignments,
    shatterMappings,
    shatterIds,
  } = _useMapStore.getState();
  const document_id = mapDocument?.document_id;
  if (!mapDocument) return;
  // ensure document_id hasn't changed
  if (document_id !== _document_id) return;
  // map must not be locked
  if (mapLock) return;
  // map must be loaded
  if (appLoadingState !== 'loaded') return;
  // map must be in edit mode
  const assignmentsToSave: Assignment[] = [];
  for (const [geo_id, zone] of zoneAssignments.entries()) {
    let parent_path = null;
    if (shatterIds.children.has(geo_id)) {
      parent_path =
        Object.entries(shatterMappings).find(([_, children]) => children.has(geo_id))?.[0] ?? null;
    }
    assignmentsToSave.push({
      document_id,
      geo_id,
      zone,
      parent_path,
    });
  }
  const clientUpdatedAt = new Date().toISOString();
  idb
    .updateDocument({
      id: document_id,
      document_metadata: mapDocument,
      assignments: assignmentsToSave,
      clientLastUpdated: clientUpdatedAt,
    })
    .then(r => {
      console.log('updated idb', r);
    })
    .catch(e => {
      console.error('error updating idb', e);
    });
};

const debouncedUpdateIdbAssignments = debounce(updateIdbAssignments, 500);

export const getMapEditSubs = (useMapStore: typeof _useMapStore) => {
  const sendZoneUpdatesOnUpdate = useMapStore.subscribe<
    [MapStore['zoneAssignments'], MapStore['appLoadingState']]
  >(
    state => [state.zoneAssignments, state.appLoadingState],
    ([zoneAssignments, appLoadingState], [_, previousAppLoadingState]) => {
      if (appLoadingState === 'blurred' || !allowSendZoneUpdates) return;
      // Update GeometryWorker on first render
      const zoneEntries = Array.from(useMapStore.getState().zoneAssignments.entries());
      GeometryWorker?.updateZones(zoneEntries);
      // Update caches / workers
      demographyCache.updatePopulations(zoneAssignments);
      // If previously not loaded, this is the initial render
      if (previousAppLoadingState !== 'loaded') return;
      const {mapDocument} = useMapStore.getState();
      if (!mapDocument) return;
      debouncedUpdateIdbAssignments(mapDocument.document_id);
    },
    {equalityFn: shallowCompareArray}
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
    healAfterEdits,
    lockMapOnShatterIdChange,
    updateGeometryWorkerState,
    _addColorSchemeSub,
  ];
};
