import {getQueriesResultsSubs} from '../utils/api/queries';
import {getSearchParamsObserver} from '../utils/api/queryParamsListener';
import {shallowCompareArray} from '../utils/helpers';
import {useDemographyStore} from './demography/demographyStore';
import {getMapEditSubs} from './mapEditSubs';
import {MapStore, useMapStore} from './mapStore';

export const initSubs = () => {
  // these need to initialize after the map store
  const querySubs = getQueriesResultsSubs(useMapStore);
  const mapEditSubs = getMapEditSubs(useMapStore);
  getSearchParamsObserver();

  const healSub = useMapStore.subscribe<
    [MapStore['mapDocument'], MapStore['shatterIds'], MapStore['appLoadingState']]
  >(
    state => [state.mapDocument, state.shatterIds, state.appLoadingState],
    ([mapDocument, _, appLoadingState]) => {
      if (appLoadingState === 'loaded') {
        useDemographyStore.getState().updateData(mapDocument);
      }
    },
    {equalityFn: shallowCompareArray}
  );

  const demogSub = useDemographyStore.subscribe(
    state => state.getMapRef,
    getMapRef => {
      const mapRef = getMapRef();
      if (!mapRef) return;
      const {mapDocument, mapOptions} = useMapStore.getState();
      if (mapOptions.showDemographicMap) {
        useDemographyStore.getState().updateData(mapDocument);
      }
    }
  );

  const unsub = () => {
    querySubs();
    mapEditSubs.forEach(sub => sub());
    healSub();
    demogSub();
  };
  return unsub;
};
