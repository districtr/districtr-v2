import axios from 'axios';
import {AssignmentsReset} from './types';

export const patchUpdateReset = async (document_id: string): Promise<AssignmentsReset> => {
  return await axios
    .patch(`${process.env.NEXT_PUBLIC_API_URL}/api/update_assignments/${document_id}/reset`, {
      document_id,
    })
    .then(res => {
      return res.data;
    });
};
