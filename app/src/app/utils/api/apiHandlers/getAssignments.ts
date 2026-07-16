import {Assignment, DocumentObject} from './types';
import {getMsgpack} from '../msgpack';
import {ACCESS_STATES} from '@constants/document/state';

type AssignmentTuple = [string, number | null, string | null];

export const getAssignments = async (mapDocument: DocumentObject | null | undefined) => {
  if (!mapDocument) {
    throw new Error('No document provided');
  }
  const queryId =
    mapDocument.access === ACCESS_STATES.READ ? mapDocument.public_id : mapDocument.document_id;
  if (!queryId) {
    throw new Error('No document provided');
  }

  const result = await getMsgpack<AssignmentTuple[]>(`get_assignments/${queryId}`);
  if (!result.ok) return result;
  const decoded: Assignment[] = result.response.map(([geo_id, zone, parent_path]) => ({
    geo_id,
    zone,
    parent_path,
  })) as Assignment[];
  return {ok: true as const, response: decoded};
};
