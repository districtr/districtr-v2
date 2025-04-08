import axios from 'axios';
import {Assignment, AssignmentsCreate} from './types';

export const patchUpdateAssignments = async ({
  assignments,
  updateHash,
}: {
  assignments: Assignment[];
  updateHash: string;
}): Promise<AssignmentsCreate> => {
  return await axios
    .patch(`${process.env.NEXT_PUBLIC_API_URL}/api/update_assignments`, {
      assignments: assignments,
      updated_at: updateHash,
    })
    .then(res => {
      return res.data;
    });
};
