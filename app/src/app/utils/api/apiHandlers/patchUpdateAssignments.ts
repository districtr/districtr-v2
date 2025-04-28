import axios from 'axios';
import {Assignment, AssignmentsCreate} from './types';

export const patchUpdateAssignments = async ({
  assignments,
  updateHash,
  userID,
}: {
  assignments: Assignment[];
  updateHash: string;
  userID: string;
}): Promise<AssignmentsCreate> => {
  return await axios
    .patch(`${process.env.NEXT_PUBLIC_API_URL}/api/update_assignments`, {
      assignments: assignments,
      updated_at: updateHash,
      user_id: userID,
    })
    .then(res => {
      return res.data;
    });
};
