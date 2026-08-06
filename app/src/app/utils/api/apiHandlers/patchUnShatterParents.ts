import {patch} from '../factory';

export const patchUnShatterParents = async ({
  document_id,
  geoids,
  zone,
  updateHash,
}: {
  document_id: string;
  geoids: string[];
  zone: number;
  updateHash: string;
}) => {
  return await patch<
    {
      geoids: string[];
      zone: number;
      updated_at: string;
    },
    {geoids: string[]}
  >(`update_assignments/${document_id}/unshatter_parents`)({
    body: {
      geoids,
      zone,
      updated_at: updateHash,
    },
  });
};
