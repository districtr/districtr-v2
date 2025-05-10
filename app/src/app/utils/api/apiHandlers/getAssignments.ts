import axios from 'axios';
import {DocumentObject, GetAssignmentsResponse} from './types';
import {useMapStore} from '@store/mapStore';

export const getAssignments = async (
  mapDocument: DocumentObject | null
): GetAssignmentsResponse => {
  if (
    mapDocument &&
    mapDocument.document_id === useMapStore.getState().loadedMapId &&
    useMapStore.getState().assignmentsHash
  ) {
    console.log(
      'Map already loaded, skipping assignment load in handlers',
      mapDocument.document_id,
      useMapStore.getState().loadedMapId
    );
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
