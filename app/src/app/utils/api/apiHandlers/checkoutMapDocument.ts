import axios from 'axios';
import {useMapStore} from '@store/mapStore';

export const checkoutMapDocument = async ({
  document_id,
  token,
  password,
}: {
  document_id: string;
  token: string;
  password: string;
}) => {
  const res = await axios.post(
    `${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}/checkout`,
    {
      token: token,
      password: password,
      user_id: useMapStore.getState().userID,
    },
    {headers: {'Content-Type': 'application/json'}}
  );
  return res.data;
};
