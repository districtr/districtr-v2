import axios from 'axios';
import {useMapStore} from '@store/mapStore';
import {DocumentObject} from './types';
import {API_URL} from '../constants';

export const getLoadPlanFromShare = async ({
  password,
  public_id,
}: {
  public_id: string | number;
  password?: string | null;
}) => {
  const res = await axios.post<DocumentObject | null>(
    `${API_URL}/api/share/load_plan_from_share`,
    {
      user_id: useMapStore.getState().userID,
      public_id: public_id,
      password: password ?? null,
    },
    {headers: {'Content-Type': 'application/json'}}
  );
  return res.data; // failure is handled in mutations.ts
};
