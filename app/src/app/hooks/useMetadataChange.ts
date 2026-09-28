import {useMapStore} from '@/app/store/mapStore';
import {DocumentMetadata} from '@utils/api/apiHandlers/types';
import {saveMapDocumentMetadata} from '@utils/api/apiHandlers/saveMapDocumentMetadata';
import {idb} from '@utils/idb/idb';
import {DRAFT_STATUSES} from '@constants/document/draftStatus';
import {canSubmitDraft, getDraftSubmission} from '@utils/draftSubmissions';
import {useDraftSubmissionStore} from '@store/draftSubmissionStore';

/** Persist a metadata change (server + idb + store), notifying on failure.
 * Shared by the topbar title/actions and the draft-status helper box. */
export function useMetadataChange() {
  const mapDocument = useMapStore(state => state.mapDocument);
  const setNotification = useMapStore(state => state.setNotification);
  const updateMetadata = useMapStore(state => state.updateMetadata);
  const openPrompt = useDraftSubmissionStore(state => state.openPrompt);

  return async (updates: Partial<DocumentMetadata>) => {
    if (!mapDocument?.document_id) return;
    const wasReady = mapDocument.map_metadata?.draft_status === DRAFT_STATUSES.READY_TO_SHARE;
    const response = await saveMapDocumentMetadata({
      document_id: mapDocument.document_id,
      metadata: updates,
    });
    if (response.ok) {
      idb.updateIdbMetadata(mapDocument.document_id, updates);
      updateMetadata(updates);
      // Map-from-portal pathway: each time the map is flipped TO ready-to-share
      // (not on every save while it already is), offer submitting the plan to
      // the portal's gallery. "Not now" just closes it; the Map actions menu
      // and Map Details keep a manual button.
      if (updates.draft_status === DRAFT_STATUSES.READY_TO_SHARE && !wasReady) {
        const draft = getDraftSubmission(mapDocument.document_id);
        if (canSubmitDraft(draft, updates.draft_status)) {
          openPrompt(mapDocument.document_id);
        }
      }
    } else {
      setNotification({
        message: 'Failed to save metadata',
        importance: 2,
        type: 'error',
      });
    }
  };
}
