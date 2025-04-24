import axios from 'axios';
import {useMapStore} from '@store/mapStore';

export const getMapLockStatus = (document_id: string): Promise<string> => {
  const userID = useMapStore.getState().userID;
  return axios
    .post(`${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}/status`, {
      user_id: userID,
    })
    .then(res => {
      return res.data.status;
    });
};
