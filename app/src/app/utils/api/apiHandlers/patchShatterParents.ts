import axios from 'axios';
import { ShatterResult } from './types';

export const patchShatterParents = async ({
  document_id,
  geoids,
  updateHash
}: {
  document_id: string;
  geoids: string[];
  updateHash: string;
}): Promise<ShatterResult> => {
  return await axios
    .patch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/update_assignments/${document_id}/shatter_parents`,
      {
        geoids: geoids,
        updated_at: updateHash,
      }
    )
    .then(res => {
      return res.data;
    });
};