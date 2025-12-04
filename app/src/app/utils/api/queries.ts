import {QueryObserver} from '@tanstack/react-query';
import {queryClient} from './queryClient';
import {DistrictrMap} from './apiHandlers/types';

import {getAvailableDistrictrMaps} from '@utils/api/apiHandlers/getAvailableDistrictrMaps';
import {useMapStore} from '@/app/store/mapStore';

const INITIAL_VIEW_LIMIT = 500;
const INITIAL_VIEW_OFFSET = 0;

const mapViewsQuery = new QueryObserver<DistrictrMap[]>(queryClient, {
  queryKey: ['views', INITIAL_VIEW_LIMIT, INITIAL_VIEW_OFFSET],
  queryFn: async () => {
    const result = await getAvailableDistrictrMaps({
      limit: INITIAL_VIEW_LIMIT,
      offset: INITIAL_VIEW_OFFSET,
    });
    if (!result.ok) {
      throw new Error(result.error.detail);
    }
    return result.response;
  },
});

const updateMapViews = (limit: number, offset: number) => {
  mapViewsQuery.setOptions({
    queryKey: ['views', limit, offset],
    queryFn: async () => {
      const result = await getAvailableDistrictrMaps({limit, offset});
      if (!result.ok) {
        throw new Error(result.error.detail);
      }
      return result.response;
    },
  });
};

const getQueriesResultsSubs = (_useMapStore: typeof useMapStore) => {
  return mapViewsQuery.subscribe(result => {
    if (result) {
      _useMapStore.getState().setMapViews(result);
    }
  });
};

export {updateMapViews, getQueriesResultsSubs, mapViewsQuery};
