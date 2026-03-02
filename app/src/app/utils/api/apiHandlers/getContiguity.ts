import {DocumentObject} from './types';
import {get} from '../factory';

type ContiguityResponse =
  | {
      ok: true;
      response: Record<string, number>;
    }
  | {
      ok: false;
      error: {
        detail: string;
      };
    };

export const getContiguity = async (
  mapDocument?: DocumentObject | null
): Promise<ContiguityResponse> => {
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
