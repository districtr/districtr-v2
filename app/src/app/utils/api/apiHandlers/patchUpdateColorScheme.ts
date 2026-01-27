import {ColorsSet} from './types';
import {colorScheme as DefaultColorScheme} from '@constants/colors';
import {useMapStore} from '@store/mapStore';
import {useAssignmentsStore} from '@store/assignmentsStore';
import {patch} from '../factory'; 
import { idb } from '../../idb/idb';

export const patchUpdateColorScheme = async ({
  document_id,
  colors,
  saveToServer = true,
}: {
  document_id: string;
  colors: string[];
  saveToServer?: boolean;
}) => {
  if (colors === DefaultColorScheme || !document_id) {
    return {
      ok: true,
      response: undefined,
    } as const;
  }

  // Update assignments store's clientLastUpdated so SavePopover detects the change
  const newClientLastUpdated = new Date().toISOString();
  useAssignmentsStore.getState().setClientLastUpdated(newClientLastUpdated);

  // Always save to IDB locally with the same timestamp
  await idb.updateColorScheme(document_id, colors, newClientLastUpdated);

  // Only save to server if explicitly requested (e.g., on manual save)
  if (!saveToServer) {
    return {  
      ok: true,
      response: {colors} as unknown as ColorsSet,
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
