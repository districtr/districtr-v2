import {useMapStore as _useMapStore} from './mapStore';
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

  return [updateGeometryWorkerState];
};
