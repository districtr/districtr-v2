import {getQueriesResultsSubs} from '../utils/api/queries';
import {getSearchParamsObserver} from '../utils/api/queryParamsListener';
import { demographyCache } from '../utils/demography/demographyCache';
import {shallowCompareArray} from '../utils/helpers';
import {useDemographyStore} from './demographyStore';
import {getMapEditSubs} from './mapEditSubs';
import {MapStore, useMapStore} from './mapStore';

export const initSubs = () => {
  // these need to initialize after the map store
  getQueriesResultsSubs(useMapStore);
  getMapEditSubs(useMapStore);
  getSearchParamsObserver();

  useMapStore.subscribe<
    [MapStore['mapDocument'], MapStore['shatterIds'], MapStore['appLoadingState']]
  >(
    state => [state.mapDocument, state.shatterIds, state.appLoadingState],
    ([mapDocument, shatterIds, appLoadingState], [_prevMapDoc, prevShatterIds]) => {
      if (appLoadingState === 'loaded') {
        const healedChildren = Array.from(prevShatterIds.children).filter(id => !shatterIds.children.has(id));
        demographyCache.exclude(healedChildren)
        useDemographyStore.getState().updateData(mapDocument, prevShatterIds.parents);
      }
    },
    {equalityFn: shallowCompareArray}
  );

  useDemographyStore.subscribe(
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
};
