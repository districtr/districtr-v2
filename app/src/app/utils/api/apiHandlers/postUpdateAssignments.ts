import {Assignment, AssignmentsCreate, AssignmentsCreateResponse} from './types';
import {post} from '../factory';

export const postUpdateAssignments = async ({
  assignments,
  document_id,
}: {
  assignments: Assignment[];
  document_id: string;
}) => {
  return await post<AssignmentsCreate, AssignmentsCreateResponse>('/api/assignments')({
    body: {
      assignments,
      document_id,
    },
  });
};
