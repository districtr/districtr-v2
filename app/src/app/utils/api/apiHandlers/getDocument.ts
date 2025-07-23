import axios from 'axios';
import {DocumentObject} from './types';
import {useMapStore} from '@store/mapStore';

export const getDocument = async (document_id: string): Promise<DocumentObject> => {
  if (!document_id) throw new Error('No document id found');

  const {userID} = useMapStore.getState();
  const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}`);
  if (userID) {
    url.searchParams.set('user_id', userID);
  }

  return await axios.get(url.toString()).then(res => {
    return res.data;
  });
};
