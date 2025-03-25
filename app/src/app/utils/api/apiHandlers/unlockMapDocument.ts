import axios from 'axios';
import { DocumentObject } from './types';
import { useMapStore } from '@store/mapStore';

export const unlockMapDocument = async (document_id: string): Promise<DocumentObject> => {
  const userID = useMapStore.getState().userID;
  if (document_id && userID) {
    return await axios
      .post(`${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}/unlock`, {
        user_id: userID,
      })
      .then(res => {
        return res.data;
      });
  } else {
    throw new Error('No document id found');
  }
};