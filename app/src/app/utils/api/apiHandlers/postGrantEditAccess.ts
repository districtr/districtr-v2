import {DocumentObject} from './types';
import {post} from '../factory';

export const postGrantEditAccess = async (public_id: number, password: string) => {
  const response = post<
    {
      password: string | null;
    },
    Pick<DocumentObject, 'document_id'>
  >(`document/${public_id}/edit_access`)({
    body: {
      password: password,
    },
  });
  return response;
};
