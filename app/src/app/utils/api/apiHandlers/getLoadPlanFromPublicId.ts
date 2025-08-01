import axios from 'axios';
import {useMapStore} from '@store/mapStore';
import {DocumentObject} from './types';
import {API_URL} from '../constants';

export const getLoadPlanFromShare = async ({
  password,
  mapDocument,
}: {
  mapDocument: DocumentObject;
  password?: string | null;
}) => {
  const res = await axios.post<DocumentObject | null>(
    `${API_URL}/api/document/${mapDocument.public_id}/checkout`,
    {
      user_id: useMapStore.getState().userID,
      document: mapDocument,
      password: password ?? null,
    },
    {headers: {'Content-Type': 'application/json'}}
  );
  return res.data; // failure is handled in mutations.ts
};
