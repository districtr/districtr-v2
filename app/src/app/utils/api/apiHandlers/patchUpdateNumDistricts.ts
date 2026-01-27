import {useMapStore} from '@store/mapStore';
import {put} from '../factory';

export interface NumDistrictsSet {
  num_districts: number;
}

export const patchUpdateNumDistricts = async ({
  document_id,
  num_districts,
}: {
  document_id: string;
  num_districts: number;
}) => {
  if (!document_id || num_districts < 1) {
    return {
      ok: false,
      error: {detail: 'Invalid document_id or num_districts'},
    } as const;
  }

  const response = await put<number, NumDistrictsSet>(
    `document/${document_id}/num_districts`
  )({
    body: num_districts,
  });

  if (!response.ok) {
    const setErrorNotification = useMapStore.getState().setErrorNotification;
    setErrorNotification({
      message: response.error.detail,
      severity: 2,
      id: `change-num-districts-${document_id}-${num_districts}`,
    });
  }

  return response;
};
