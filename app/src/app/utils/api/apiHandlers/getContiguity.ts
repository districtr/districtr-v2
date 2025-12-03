import {DocumentObject} from './types';
import {get} from '../factory';

export const getContiguity = async (mapDocument: DocumentObject) => {
  if (!mapDocument) {
    return {
      ok: false,
      error: {
        detail: 'No document provided',
      },
    } as const;
  }

  return await get<Record<string, number>>(`document/${mapDocument.public_id}/contiguity`)({});
};
