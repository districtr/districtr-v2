import type {ShatterResult} from './types';
import {post} from '../factory';

export const postGetChildEdges = async ({
  document_id,
  geoids,
}: {
  document_id: string;
  geoids: string[];
}): Promise<ShatterResult> => {
  return await post<{geoids: string[]}, ShatterResult>(`edges/${document_id}`)({
    body: {
      geoids: geoids,
    },
  }).then(res => {
    if (res.ok) {
      return res.response;
    } else {
      throw new Error(res.error.detail);
    }
  });
};
