import axios from 'axios';
import { ColorsSet } from './types';
import { colorScheme as DefaultColorScheme } from '@constants/colors';
import { useMapStore } from '@store/mapStore';

export const saveColorScheme = async ({
  document_id,
  colors,
}: {
  document_id: string;
  colors: string[];
}): Promise<ColorsSet | undefined> => {
  if (colors === DefaultColorScheme) {
    return;
  }
  return await axios
    .patch(`${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}/update_colors`, colors)
    .then(res => {
      return res.data;
    })
    .catch(err => {
      const setErrorNotification = useMapStore.getState().setErrorNotification;
      setErrorNotification({
        message: err.response.data.message,
        severity: 2,
        id: `change-colors-${document_id}-${colors.join('-')}`,
      });
      throw err;
    });
};