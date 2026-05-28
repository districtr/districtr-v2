import {Assignment, DocumentObject} from './types';
import {get} from '../factory';
import {ACCESS_STATES} from '@constants/document/state';

export const getAssignments = async (mapDocument: DocumentObject | null | undefined) => {
  if (!mapDocument) {
    throw new Error('No document provided');
  }
  const queryId =
    mapDocument.access === ACCESS_STATES.READ ? mapDocument.public_id : mapDocument.document_id;
  if (queryId) {
    return await get<Assignment[]>(`get_assignments/${queryId}`)({});
  } else {
    throw new Error('No document provided');
  }
};
