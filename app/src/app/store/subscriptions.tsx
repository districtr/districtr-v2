import {getQueriesResultsSubs} from '../utils/api/queries';
import {getSearchParamsObserver} from '../utils/api/queryParamsListener';
import {shallowCompareArray} from '../utils/helpers';
import {useDemographyStore} from './demographicMap';
import {useHoverStore} from './hoverFeatures';
import {getMapEditSubs} from './mapEditSubs';
import {getRenderSubscriptions} from './mapRenderSubs';
import {MapStore, useMapStore} from './mapStore';
import {getMapMetricsSubs} from './metricsSubs';

export const initSubs = () => {
  // these need to initialize after the map store
  getRenderSubscriptions(useMapStore, useHoverStore, useDemographyStore);
  getQueriesResultsSubs(useMapStore);
  getMapEditSubs(useMapStore);
  getMapMetricsSubs(useMapStore);
  getSearchParamsObserver();

  useMapStore.subscribe<[MapStore['mapDocument'], MapStore['shatterIds']['parents']]>(
    state => [state.mapDocument, state.shatterIds.parents],
    ([mapDocument], [_prevMapDoc, prevParentShatterIds]) => {
      useDemographyStore.getState().updateData(mapDocument, prevParentShatterIds);
    },
    {equalityFn: shallowCompareArray}
  );

  useDemographyStore.subscribe(
    state => state.getMapRef,
    getMapRef => {
      const mapRef = getMapRef();
      if (!mapRef) return;
      const {mapDocument, shatterIds, mapOptions} = useMapStore.getState();
      if (mapOptions.showDemographicMap) {
        useDemographyStore.getState().updateData(mapDocument);
      }
    }
  );
};
