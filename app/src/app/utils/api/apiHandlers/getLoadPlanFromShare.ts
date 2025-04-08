import axios from 'axios';
import {useMapStore} from '@store/mapStore';

export const getLoadPlanFromShare = async ({
  token,
  password,
  access,
}: {
  token: string;
  password?: string | null;
  access: string;
}) => {
  const res = await axios.post(
    `${process.env.NEXT_PUBLIC_API_URL}/api/share/load_plan_from_share`,
    {
      token: token,
      user_id: useMapStore.getState().userID,
      password: password ?? null,
      access: access,
    },
    {headers: {'Content-Type': 'application/json'}}
  );
  return res.data; // failure is handled in mutations.ts
};
