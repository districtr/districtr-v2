import {useMapStore} from '@/app/store/mapStore';
import {DocumentMetadata} from '@utils/api/apiHandlers/types';
import {saveMapDocumentMetadata} from '@utils/api/apiHandlers/saveMapDocumentMetadata';
import {idb} from '@utils/idb/idb';
import {DRAFT_STATUSES} from '@constants/document/draftStatus';
import {getDraftSubmission} from '@utils/draftSubmissions';
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
    const response = await saveMapDocumentMetadata({
      document_id: mapDocument.document_id,
      metadata: updates,
    });
    if (response.ok) {
      idb.updateIdbMetadata(mapDocument.document_id, updates);
      updateMetadata(updates);
      // Map-from-portal pathway: flipping to ready-to-share offers
      // submitting the plan to the portal's gallery (once — "Not now"
      // suppresses the prompt; the Save & Share menu keeps a manual button).
      // Only 'prompt'-mode portals ask; auto modes are flipped server-side
      // and 'form' portals never create drafts. Legacy records without a
      // stored mode predate the modes and were all prompt-flow.
      if (updates.draft_status === DRAFT_STATUSES.READY_TO_SHARE) {
        const draft = getDraftSubmission(mapDocument.document_id);
        const isPromptMode = (draft?.collectionMode ?? 'prompt') === 'prompt';
        if (draft && isPromptMode && !draft.submitted && !draft.suppressed) {
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
