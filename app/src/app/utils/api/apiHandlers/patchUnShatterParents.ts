import axios from 'axios';

export const patchUnShatterParents = async ({
  document_id,
  geoids,
  zone,
  updateHash
}: {
  document_id: string;
  geoids: string[];
  zone: number;
  updateHash: string;
}): Promise<{geoids: string[]}> => {
  return await axios
    .patch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/update_assignments/${document_id}/unshatter_parents`,
      {
        geoids,
        zone,
        updated_at: updateHash,
      }
    )
    .then(res => {
      return res.data;
    });
};