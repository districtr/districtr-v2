import axios from 'axios';
import {DocumentObject, GetAssignmentsResponse} from './types';
import {useMapStore} from '@store/mapStore';

export const getAssignments = async (
  mapDocument: DocumentObject | null
): GetAssignmentsResponse => {
  const {loadedMapId, assignmentsHash, setAppLoadingState, setMapLock} = useMapStore.getState();
  if (mapDocument && mapDocument.document_id === loadedMapId && assignmentsHash) {
    console.log(
      'Map already loaded, skipping assignment load in handlers',
      mapDocument.document_id,
      loadedMapId
    );
    // clear spinner / shade conditions
    setAppLoadingState('loaded');
    setMapLock(false);
    return null;
  }
  if (mapDocument?.document_id) {
    return await axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/api/get_assignments/${mapDocument.document_id}`)
      .then(res => {
        return {
          type: 'remote',
          documentId: mapDocument.document_id,
          assignments: res.data,
        };
      });
  } else {
    throw new Error('No document provided');
  }
};
