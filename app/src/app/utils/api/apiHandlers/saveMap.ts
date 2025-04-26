import {useMapStore} from '@/app/store/mapStore';
import {document, metadata} from '../mutations';
import {handleCreateBlankMetadataObject} from '../../helpers';
import {DocumentMetadata} from '../apiHandlers/types';

export const saveMap = async (latestMetadata: DocumentMetadata | null) => {
  const {mapDocument, mapStatus, upsertUserMap, setMapDocument, setShareMapMessage} =
    useMapStore.getState();
  console.log('saveMap', {latestMetadata, mapDocument, mapStatus});
  if (mapDocument?.document_id) {
    if (mapStatus?.status === 'locked') {
      // atp doesn't matter that it's locked, even with pw; should be able to copy map
      // what we need is a pw entry field to open if there's a pw required in the url
      await document
        .mutate({
          districtr_map_slug: mapDocument?.districtr_map_slug ?? '',
          metadata: latestMetadata ?? handleCreateBlankMetadataObject(),
          user_id: useMapStore.getState().userID,
          copy_from_doc: mapDocument?.document_id,
        })
        .then(data => {
          const updatedMetadata = latestMetadata ?? handleCreateBlankMetadataObject();
          metadata.mutate({document_id: data.document_id, metadata: updatedMetadata});

          const updatedMapDoc = {...data, map_metadata: updatedMetadata};

          upsertUserMap({documentId: data.document_id, mapDocument: updatedMapDoc});
          console.log('updatedMapDoc: ', updatedMapDoc);
          setMapDocument(updatedMapDoc);
          const documentUrl = new URL(window.location.toString());
          documentUrl.searchParams.delete('share'); // remove share + token from url
          documentUrl.searchParams.set('document_id', data.document_id);
          history.pushState({}, '', documentUrl.toString());
        })
        .catch(err => {
          setShareMapMessage(
            `Unable to copy map. Reference: ${mapDocument?.document_id}|${mapDocument?.districtr_map_slug}`
          );
        });
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
    }
  }
};
