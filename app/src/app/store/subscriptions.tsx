import {getQueriesResultsSubs} from '@utils/api/queries';
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

  const demogInitSub = useDemographyStore.subscribe(
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

  const demogMapDocumentSub = useMapStore.subscribe(
    state => state.mapDocument,
    (curr, prev) => {
      if (!curr || prev === curr || prev?.document_id === curr.document_id) return;
      useDemographyStore.getState().updateData(curr);
    }
  );

  const demogShatterSub = useAssignmentsStore.subscribe(
    state => state.shatterIds.parents,
    (curr, prev) => {
      if (!curr || prev === curr) return;
      const mapDocument = useMapStore.getState().mapDocument;
      if (!mapDocument) return;
      useDemographyStore.getState().updateData(mapDocument, Array.from(curr));
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
    demogInitSub();
    demogMapDocumentSub();
    demogShatterSub();
    featureFlagSub();
  };
  return unsub;
};
