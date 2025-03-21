import {useMapStore} from '@/app/store/mapStore';
import {document, metadata} from '../mutations';

export const getMapCopy = () => {
  const {mapDocument, upsertUserMap, setMapDocument} = useMapStore.getState();
  console.log("!!!", mapDocument)
  if (mapDocument?.districtr_map_slug) {
    document
      .mutate({
        districtr_map_slug: mapDocument?.districtr_map_slug ?? '',
        metadata: mapDocument?.map_metadata,
        user_id: useMapStore.getState().userID,
        copy_from_doc: mapDocument?.document_id,
      })
      .then(data => {
        console.log("!!!", data)
        // update in db
        metadata.mutate({
          document_id: data.document_id,
          metadata: mapDocument?.map_metadata,
        });
        // update in usermaps
        upsertUserMap({
          documentId: data.document_id,
          mapDocument: {
            ...data,
            map_metadata: mapDocument?.map_metadata,
          },
        });
        // swap out current map with newly copied one
        data.map_metadata = mapDocument?.map_metadata;
        setMapDocument(data);
        // should open the map save modal with the proper map open?
      });
  }
};
