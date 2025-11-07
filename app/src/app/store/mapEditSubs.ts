import {saveColorScheme} from '../utils/api/apiHandlers/saveColorScheme';
import {useMapStore as _useMapStore, MapStore} from './mapStore';
import {shallowCompareArray} from '@utils/arrays';
import GeometryWorker from '../utils/GeometryWorker';
import {useAssignmentsStore} from './assignmentsStore';

export const getMapEditSubs = (useMapStore: typeof _useMapStore) => {
  const updateGeometryWorkerState = useAssignmentsStore.subscribe(
    state => state.shatterIds,
    curr => {
      GeometryWorker?.handleShatterHeal({
        parents: Array.from(curr.parents),
        children: Array.from(curr.children),
      });
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

  return [updateGeometryWorkerState, _addColorSchemeSub];
};
