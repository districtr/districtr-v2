import {useEffect} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useMapStore} from '../store/mapStore';
import {useAssignmentsStore} from '../store/assignmentsStore';
import {getPointSelectionData} from '../utils/api/apiHandlers/getPointSelectionData';
import {EMPTY_FT_COLLECTION} from '../constants/map/layerStyle';
import {BLOCK_SOURCE_ID} from '../constants/map/layerIds';
import GeometryWorker from '../utils/GeometryWorker';

export const usePointData = (isChild?: boolean) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const exposedChildIds = useAssignmentsStore(state => state.shatterIds.children);
  const layer = isChild ? mapDocument?.child_layer : mapDocument?.parent_layer;
  const exposedChildIdsKey = isChild ? JSON.stringify(Array.from(exposedChildIds)) : undefined;

  const query = useQuery({
    queryKey: ['pointData', layer, isChild, exposedChildIdsKey],
    queryFn: () => {
      if (isChild && !exposedChildIds.size) return EMPTY_FT_COLLECTION;
      return getPointSelectionData({
        layer: layer!,
        columns: ['path', 'x', 'y', 'total_pop_20'],
        filterIds: isChild ? exposedChildIds : undefined,
        source: BLOCK_SOURCE_ID,
      });
    },
    enabled: !!layer,
  });

  useEffect(() => {
    const data = query.data ?? EMPTY_FT_COLLECTION;
    if (!GeometryWorker) return;
    if (isChild) {
      GeometryWorker.setChildPointData(data);
    } else {
      GeometryWorker.setPointData(data);
    }
  }, [query.data, isChild]);

  return query.data ?? EMPTY_FT_COLLECTION;
};
