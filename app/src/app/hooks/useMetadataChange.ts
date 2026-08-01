import {useMapStore} from '@/app/store/mapStore';
import {DocumentMetadata} from '@utils/api/apiHandlers/types';
import {saveMapDocumentMetadata} from '@utils/api/apiHandlers/saveMapDocumentMetadata';
import {idb} from '@utils/idb/idb';

/** Persist a metadata change (server + idb + store), notifying on failure.
 * Shared by the topbar title/actions and the draft-status helper box. */
export function useMetadataChange() {
  const mapDocument = useMapStore(state => state.mapDocument);
  const setNotification = useMapStore(state => state.setNotification);
  const updateMetadata = useMapStore(state => state.updateMetadata);

  return async (updates: Partial<DocumentMetadata>) => {
    if (!mapDocument?.document_id) return;
    const response = await saveMapDocumentMetadata({
      document_id: mapDocument.document_id,
      metadata: updates,
    });
    if (response.ok) {
      idb.updateIdbMetadata(mapDocument.document_id, updates);
      updateMetadata(updates);
    } else {
      setNotification({
        message: 'Failed to save metadata',
        importance: 2,
        type: 'error',
      });
    }
  };
}
