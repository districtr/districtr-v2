import {DocumentObject} from './types';
import {useMapStore} from '@store/mapStore';
import {get} from '../factory';

export const getDocument = async (document_id?: string) => {
  if (!document_id) {
    return {
      ok: false,
      error: {
        detail: 'No document ID provided',
      },
    };
  }

  const {userID} = useMapStore.getState();
  const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}`);
  if (userID) {
    url.searchParams.set('user_id', userID);
  }
  return await get<DocumentObject>(`/api/document/${document_id}`)({});
};
