import axios from 'axios';
import {useMapStore} from '@store/mapStore';

export const getLoadPlanFromPublicId = async ({
  public_id,
  password,
}: {
  public_id: number;
  password?: string | null;
}) => {
  const res = await axios.post(
    `${process.env.NEXT_PUBLIC_API_URL}/api/share/public/${public_id}/unlock`,
    {
      user_id: useMapStore.getState().userID,
      password: password ?? null,
    },
    {headers: {'Content-Type': 'application/json'}}
  );
  return res.data; // failure is handled in mutations.ts
};
