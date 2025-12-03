import {ColorsSet} from './types';
import {colorScheme as DefaultColorScheme} from '@constants/colors';
import {useMapStore} from '@store/mapStore';
import {patch} from '../factory';

export const saveColorScheme = async ({
  document_id,
  colors,
}: {
  document_id: string;
  colors: string[];
}) => {
  if (colors === DefaultColorScheme || !document_id) {
    return {
      ok: true,
      response: undefined,
    } as const;
  }

  const response = await patch<string[], ColorsSet>(`document/${document_id}/update_colors`)({
    body: colors,
  });

  if (!response.ok) {
    const setErrorNotification = useMapStore.getState().setErrorNotification;
    setErrorNotification({
      message: response.error.detail,
      severity: 2,
      id: `change-colors-${document_id}-${colors.join('-')}`,
    });
  }

  return response;
};
