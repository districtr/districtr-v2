import {getQueriesResultsSubs} from '@utils/api/queries';
import {shallowCompareArray} from '@utils/arrays';
import {useDemographyStore} from './demography/demographyStore';
import {useFeatureFlagStore} from './featureFlagStore';
import {getMapEditSubs} from './mapEditSubs';
import {MapStore, useMapStore} from './mapStore';
import {useMapControlsStore} from './mapControlsStore';
import {useAssignmentsStore} from './assignmentsStore';

export const initSubs = () => {
  // these need to initialize after the map store
  const querySubs = getQueriesResultsSubs(useMapStore);
  const mapEditSubs = getMapEditSubs(useMapStore);

  const shatterSub = useAssignmentsStore.subscribe(
    state => state.shatterIds,
    () => {
      const {mapDocument, appLoadingState} = useMapStore.getState();
      if (appLoadingState === 'loaded') {
        useDemographyStore.getState().updateData(mapDocument);
      }
    }
  );

  const healSub = useMapStore.subscribe<[MapStore['mapDocument'], MapStore['appLoadingState']]>(
    state => [state.mapDocument, state.appLoadingState],
    ([mapDocument, appLoadingState]) => {
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
      const {mapDocument} = useMapStore.getState();
      const {mapOptions} = useMapControlsStore.getState();
      if (mapOptions.showDemographicMap) {
        useDemographyStore.getState().updateData(mapDocument);
      }
    }
  );

  const featureFlagSub = useMapStore.subscribe<[MapStore['mapDocument']]>(
    state => [state.mapDocument],
    ([mapDocument]) => {
      useFeatureFlagStore.getState().updateData(mapDocument);
    }
  );

  const unsub = () => {
    querySubs();
    mapEditSubs.forEach(sub => sub());
    shatterSub();
    healSub();
    demogSub();
    featureFlagSub();
  };
  return unsub;
};
