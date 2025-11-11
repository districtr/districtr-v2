import {DocumentObject} from './types';
import {useMapStore} from '@store/mapStore';
import {get} from '../factory';

export const getDocument = async (document_id?: string) => {
  if (!document_id) {
    return {
      ok: false,
      error: {
        detail: 'No document ID provided',
      },
    } as const;
  }

  return await get<DocumentObject>(`document/${document_id}`)({});
};
