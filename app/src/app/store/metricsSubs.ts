import {updateMapMetrics, updateTotPop} from '../utils/api/queries';
import { useChartStore } from './chartStore';
import {useMapStore as _useMapStore} from './mapStore';

export const getMapMetricsSubs = (useMapStore: typeof _useMapStore) => {
  const mapMetricsSub = useMapStore.subscribe(
    state => state.mapDocument,
    mapDocument => {
      useChartStore.getState().setMapMetrics(null);
      if (mapDocument) {
        updateMapMetrics(mapDocument);
        updateTotPop(mapDocument)
      }
    }
  );
  return [mapMetricsSub];
};
