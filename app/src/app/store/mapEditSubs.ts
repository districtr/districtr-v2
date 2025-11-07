import {debounce} from 'lodash';
import {saveColorScheme} from '../utils/api/apiHandlers/saveColorScheme';
import {useMapStore as _useMapStore, MapStore} from './mapStore';
import {shallowCompareArray} from '../utils/helpers';
import GeometryWorker from '../utils/GeometryWorker';
import {demographyCache} from '../utils/demography/demographyCache';
import {Assignment} from '@utils/api/apiHandlers/types';
import {idb} from '@utils/idb/idb';

export const getMapEditSubs = (useMapStore: typeof _useMapStore) => {
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
