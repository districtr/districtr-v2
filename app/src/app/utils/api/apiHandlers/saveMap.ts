import {useMapStore} from '@/app/store/mapStore';
import {document, metadata} from '../mutations';
import {handleCreateBlankMetadataObject} from '../../helpers';
import {DocumentMetadata} from '../apiHandlers/types';

export const saveMap = async (latestMetadata: DocumentMetadata | null) => {
  const {mapDocument, mapStatus, setMapStatus, upsertUserMap, setShareMapMessage} =
    useMapStore.getState();
  if (!mapDocument?.document_id) return;

  if (mapStatus?.status === 'locked' || mapStatus?.access === 'read') {
    // atp doesn't matter that it's locked, even with pw; should be able to copy map
    // what we need is a pw entry field to open if there's a pw required in the url
    try {
      const newDocumentData = await document.mutate({
        districtr_map_slug: mapDocument?.districtr_map_slug ?? '',
        metadata: latestMetadata ?? handleCreateBlankMetadataObject(),
        user_id: useMapStore.getState().userID,
        copy_from_doc:
          mapDocument?.access === 'read' && mapDocument?.public_id
            ? mapDocument?.public_id
            : mapDocument?.document_id,
      });

      const updatedMetadata = latestMetadata ?? handleCreateBlankMetadataObject();
      metadata.mutate({document_id: newDocumentData.document_id, metadata: updatedMetadata});
      const updatedMapDoc = {...newDocumentData, map_metadata: {...updatedMetadata}};
      upsertUserMap({documentId: newDocumentData.document_id, mapDocument: updatedMapDoc});
      // TODO Neither of these two settings seem to properly tell the client that the document can be edited
      setMapStatus({
        access: updatedMapDoc.access,
        status: updatedMapDoc.status,
      });
      console.log('!!!NEW DOCUMENT', newDocumentData);
      return newDocumentData;
    } catch (err) {
      console.error('Error saving map: ', err);
      setShareMapMessage(
        `Unable to copy map. Reference: ${mapDocument?.document_id}|${mapDocument?.districtr_map_slug}`
      );
      return null;
    }
  } else {
    await metadata.mutate({
      document_id: mapDocument?.document_id,
      metadata: latestMetadata ?? handleCreateBlankMetadataObject(),
    });
    upsertUserMap({
      documentId: mapDocument?.document_id,
      mapDocument: {
        ...mapDocument,
        map_metadata: latestMetadata ?? handleCreateBlankMetadataObject(),
      },
    });
    return mapDocument;
  }
};
