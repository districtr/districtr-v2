import {idb} from '@/app/utils/idb/idb';
import {LocalAssignmentsResponse} from './types';

/**
 * Gets assignments from IndexedDB for a given document ID
 */
export const getAssignmentsFromIdb = async (
  document_id: string
): Promise<LocalAssignmentsResponse | null> => {
  const storedDoc = await idb.getDocument(document_id);
  if (!storedDoc || !storedDoc.assignments) {
    return null;
  }
  return {
    type: 'local',
    documentId: document_id,
    assignments: storedDoc.assignments,
  };
};
