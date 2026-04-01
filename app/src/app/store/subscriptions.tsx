import {getQueriesResultsSubs} from '@utils/api/queries';
import {useDemographyStore} from './demography/demographyStore';
import {useFeatureFlagStore} from './featureFlagStore';
import {getMapEditSubs} from './mapEditSubs';
import {MapStore, useMapStore} from './mapStore';
import {useMapControlsStore} from './mapControlsStore';
import {useAssignmentsStore} from './assignmentsStore';
import {useCoiAssignmentsStore} from './coiAssignmentsStore';
import {demographyService} from '../utils/demography/demographyService';
import {shallowCompareArray} from '../utils/arrays';

export const initSubs = (readOnly = false) => {
  // these need to initialize after the map store
  const querySubs = getQueriesResultsSubs(useMapStore);

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
      if (curr.access === 'read') return; // PublicSource handles read-only data loading
      useDemographyStore.getState().restoreCoalition(curr);
      useDemographyStore.getState().updateData(curr);
    }
  );
  // Clear undo/redo history when switching documents.
  // Also reset clientLastUpdated to '' so that temporalDiff treats the next
  // ingestFromDocument as "not yet ingested" and doesn't create a stale snapshot
  // from the previous document's state.
  const clearTemporalOnDocChangeSub = useMapStore.subscribe(
    state => state.mapDocument?.document_id,
    (curr, prev) => {
      if (curr === prev) return;
      useAssignmentsStore.temporal.getState().clear();
      useCoiAssignmentsStore.temporal.getState().clear();
      useAssignmentsStore.setState({clientLastUpdated: ''});
      useCoiAssignmentsStore.setState({clientLastUpdated: ''});
    }
  );
  const numDistrictsSub = useMapStore.subscribe(
    state => state.mapDocument?.num_districts,
    (curr, prev) => {
      if (!curr || prev === curr) return;
      demographyService.updateSummaryStats();
    }
  );
  const numCommunitiesSub = useMapStore.subscribe(
    state => state.numCommunities,
    (curr, prev) => {
      if (prev === curr) return;
      demographyService.updateSummaryStats();
    }
  );

  const demogShatterSub = useAssignmentsStore.subscribe(
    state => state.shatterIds.parents,
    (curr, prev) => {
      if (useMapControlsStore.getState().mapMode === 'coi') return;
      if (!curr || prev === curr) return;
      const mapDocument = useMapStore.getState().mapDocument;
      if (!mapDocument) return;
      useDemographyStore.getState().updateData(mapDocument, Array.from(curr));
    }
  );
  const demogCoiShatterSub = useCoiAssignmentsStore.subscribe(
    state => state.shatterIds.parents,
    (curr, prev) => {
      if (useMapControlsStore.getState().mapMode !== 'coi') return;
      if (!curr || prev === curr) return;
      const mapDocument = useMapStore.getState().mapDocument;
      if (!mapDocument) return;
      useDemographyStore.getState().updateData(mapDocument, Array.from(curr));
    }
  );

  const paintFlushSub = useMapControlsStore.subscribe(
    state => state.isPainting,
    (isPainting, wasPainting) => {
      if (!wasPainting || isPainting) return;
      if (useMapControlsStore.getState().mapMode === 'coi') {
        useCoiAssignmentsStore.getState().ingestAccumulatedAssignments();
        return;
      }
      useAssignmentsStore.getState().ingestAccumulatedAssignments();
    }
  );

  const featureFlagSub = useMapStore.subscribe<[MapStore['mapDocument']]>(
    state => [state.mapDocument],
    ([mapDocument]) => {
      useFeatureFlagStore.getState().updateData(mapDocument);
    }
  );

  const readOnlyUnsubs: Array<() => void> = [];

  if (readOnly) {
    // Fetch VTD data for overlay choropleth when demographic map is enabled
    readOnlyUnsubs.push(
      useMapControlsStore.subscribe(
        state => state.mapOptions.showDemographicMap,
        showDemographic => {
          if (!showDemographic) return;
          const {mapDocument} = useMapStore.getState();
          if (mapDocument) {
            useDemographyStore.getState().updateData(mapDocument);
          }
        }
      )
    );
  }

  const editorUnsubs: Array<() => void> = [];

  if (!readOnly) {
    const mapEditSubs = getMapEditSubs(useMapStore);
    editorUnsubs.push(...mapEditSubs);
  }

  const unsub = () => {
    querySubs();
    demogInitSub();
    demogMapDocumentSub();
    clearTemporalOnDocChangeSub();
    numDistrictsSub();
    numCommunitiesSub();
    demogShatterSub();
    demogCoiShatterSub();
    paintFlushSub();
    featureFlagSub();
    readOnlyUnsubs.forEach(sub => sub());
    editorUnsubs.forEach(sub => sub());
  };
  return unsub;
};
