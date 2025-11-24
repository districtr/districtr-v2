import {Assignment, AssignmentsCreate, AssignmentsCreateResponse} from './types';
import {put} from '../factory';

export const postUpdateAssignments = async ({
  assignments,
  document_id,
  last_updated_at,
  overwrite = false,
}: {
  assignments: Assignment[];
  document_id: string;
  last_updated_at: string;
  overwrite?: boolean;
}) => {
  return await put<AssignmentsCreate, AssignmentsCreateResponse>('assignments')({
    body: {
      assignments,
      document_id,
      last_updated_at,
      overwrite,
    },
  });
};
