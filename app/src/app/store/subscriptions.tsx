import {getQueriesResultsSubs} from '@utils/api/queries';
import {useDemographyStore} from './demography/demographyStore';
import {useFeatureFlagStore} from './featureFlagStore';
import {getMapEditSubs} from './mapEditSubs';
import {MapStore, useMapStore} from './mapStore';
import {useMapControlsStore} from './mapControlsStore';
import {useAssignmentsStore} from './assignmentsStore';
import {useCoiAssignmentsStore} from './coiAssignmentsStore';
import {demographyCache} from '../utils/demography/demographyCache';

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
  // Clear undo/redo history when switching documents
  const clearTemporalOnDocChangeSub = useMapStore.subscribe(
    state => state.mapDocument?.document_id,
    (curr, prev) => {
      if (prev === curr) return;
      useAssignmentsStore.temporal.getState().clear();
      useCoiAssignmentsStore.temporal.getState().clear();
    }
  );
  const numDistrictsSub = useMapStore.subscribe(
    state => state.mapDocument?.num_districts,
    (curr, prev) => {
      if (!curr || prev === curr) return;
      demographyCache.updateSummaryStats();
    }
  );
  const numCommunitiesSub = useMapStore.subscribe(
    state => state.numCommunities,
    (curr, prev) => {
      if (prev === curr) return;
      demographyCache.updateSummaryStats();
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

  // Reverse sync: when undo/redo restores communities in coiAssignmentsStore,
  // push the restored metadata back to mapStore so the UI stays consistent.
  const coiCommunitySyncSub = useCoiAssignmentsStore.subscribe(
    state => state.communities,
    communities => {
      if (useMapControlsStore.getState().mapMode !== 'coi') return;
      if (!communities?.length) return;
      const current = useMapStore.getState().communities;
      if (current === communities) return;
      const currentIds = current.map(c => c.id).join(',');
      const newIds = communities.map(c => c.id).join(',');
      if (currentIds === newIds && JSON.stringify(current) === JSON.stringify(communities)) return;
      useMapStore.getState().setCommunities(communities);
    }
  );

  // Reverse sync: when undo/redo restores description comments in coiAssignmentsStore,
  // merge them with user-authored zone comments (which are never affected by undo/redo).
  // Comments for communities that no longer exist in the restored state are dropped.
  const coiDocumentCommentsSyncSub = useCoiAssignmentsStore.subscribe(
    state => state.documentComments,
    (restoredDescriptionComments, previousDescriptionComments) => {
      if (useMapControlsStore.getState().mapMode !== 'coi') return;
      if (!restoredDescriptionComments) return;
      const mapDocument = useMapStore.getState().mapDocument;
      if (!mapDocument) return;

      const restoredCommunities = useCoiAssignmentsStore.getState().communities;
      const restoredCommunityIds = new Set(restoredCommunities.map(c => c.id));

      // Collect description IDs from both restored and previous states so that
      // description comments from newly-created communities (which may reuse a
      // zone ID) are properly replaced rather than duplicated.
      const descriptionIdsToReplace = new Set([
        ...restoredDescriptionComments.map(c => c.comment_id).filter(Boolean),
        ...(previousDescriptionComments ?? []).map(c => c.comment_id).filter(Boolean),
      ]);

      const currentComments = mapDocument.document_comments ?? [];

      // Keep user-authored comments whose zone still exists in the restored communities.
      // Drop all known description comments (they'll be replaced by the restored ones).
      const userComments = currentComments.filter(c => {
        if (c.comment_id && descriptionIdsToReplace.has(c.comment_id)) return false;
        if (c.zone != null && !restoredCommunityIds.has(c.zone)) return false;
        return true;
      });

      const merged = [...userComments, ...restoredDescriptionComments];
      if (JSON.stringify(currentComments) === JSON.stringify(merged)) return;
      useMapStore.getState().mutateMapDocument({document_comments: merged});
    }
  );

  const unsub = () => {
    querySubs();
    mapEditSubs.forEach(sub => sub());
    demogInitSub();
    demogMapDocumentSub();
    clearTemporalOnDocChangeSub();
    numDistrictsSub();
    numCommunitiesSub();
    demogShatterSub();
    demogCoiShatterSub();
    paintFlushSub();
    featureFlagSub();
    coiCommunitySyncSub();
    coiDocumentCommentsSyncSub();
  };
  return unsub;
};
