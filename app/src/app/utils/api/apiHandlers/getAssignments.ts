import axios from 'axios';
import {DocumentObject, GetAssignmentsResponse} from './types';

export const getAssignments = async (
  mapDocument: DocumentObject | null
): GetAssignmentsResponse => {
  if (!mapDocument) {
    throw new Error('No document provided');
  }
  const queryId = mapDocument.access === 'read' ? mapDocument.public_id : mapDocument.document_id;
  if (queryId) {
    console.log('!!!mapDocument.document_id', queryId);
    return await axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/api/get_assignments/${queryId}`)
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
