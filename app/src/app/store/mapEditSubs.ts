import {useMapStore as _useMapStore} from './mapStore';
import GeometryWorker from '../utils/GeometryWorker';
import {useAssignmentsStore} from './assignmentsStore';
import {useCoiAssignmentsStore} from './coiAssignmentsStore';
import {useMapControlsStore} from './mapControlsStore';
import {MAP_MODES} from '@constants/map/mode';

export const getMapEditSubs = (useMapStore: typeof _useMapStore) => {
  const updateGeometryWorkerState = useAssignmentsStore.subscribe(
    state => state.shatterIds,
    curr => {
      if (useMapControlsStore.getState().mapMode === MAP_MODES.COI) return;
      GeometryWorker?.handleShatterHeal({
        parents: Array.from(curr.parents),
        children: Array.from(curr.children),
      });
    }
  );

  const updateCoiGeometryWorkerState = useCoiAssignmentsStore.subscribe(
    state => state.shatterIds,
    curr => {
      if (useMapControlsStore.getState().mapMode !== MAP_MODES.COI) return;
      GeometryWorker?.handleShatterHeal({
        parents: Array.from(curr.parents),
        children: Array.from(curr.children),
      });
    }
  );

  return [updateGeometryWorkerState, updateCoiGeometryWorkerState];
};
