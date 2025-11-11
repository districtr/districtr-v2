import {Assignment, AssignmentsCreate, AssignmentsCreateResponse} from './types';
import {put} from '../factory';

export const postUpdateAssignments = async ({
  assignments,
  document_id,
  last_updated_at,
}: {
  assignments: Assignment[];
  document_id: string;
  last_updated_at: string;
}) => {
  return await put<AssignmentsCreate, AssignmentsCreateResponse>('assignments')({
    body: {
      assignments,
      document_id,
      last_updated_at,
    },
  });
};
