import {DocumentObject} from './types';
import {post} from '../factory';

export const postUnlockMapDocument = async (public_id: number, password: string) => {
  const response = post<
    {
      password: string | null;
    },
    Pick<DocumentObject, 'document_id'>
  >(`document/${public_id}/unlock`)({
    body: {
      password: password,
    },
  });
  return response;
};
