import {useMapStore} from '@/app/store/mapStore';
import {document, metadata} from '../mutations';
import {handleCreateBlankMetadataObject} from '../../helpers';
import {DocumentMetadata} from '../apiHandlers';

export const saveMap = async (latestMetadata: DocumentMetadata | null) => {
  const {mapDocument, upsertUserMap, setMapDocument} = useMapStore.getState();
  if (mapDocument?.document_id) {
    if (mapDocument?.status === 'locked') {
      // atp doesn't matter that it's locked, even with pw; should be able to copy map
      // what we need is a pw entry field to open if there's a pw required in the url
      await document
        .mutate({
          districtr_map_slug: mapDocument?.gerrydb_table ?? '',
          metadata: latestMetadata ?? handleCreateBlankMetadataObject(),
          user_id: useMapStore.getState().userID,
          copy_from_doc: mapDocument?.document_id,
        })
        .then(data => {
          const updatedMetadata = latestMetadata ?? handleCreateBlankMetadataObject();
          metadata.mutate({document_id: data.document_id, metadata: updatedMetadata});

          const updatedMapDoc = {...data, map_metadata: updatedMetadata};

          upsertUserMap({documentId: data.document_id, mapDocument: updatedMapDoc});

          setMapDocument(updatedMapDoc);
          const documentUrl = new URL(window.location.toString());
          documentUrl.searchParams.delete('share'); // remove share + token from url
          documentUrl.searchParams.set('document_id', data.document_id);
          history.pushState({}, '', documentUrl.toString());
        });
    } else {
      console.log('in the not locked category now');
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
