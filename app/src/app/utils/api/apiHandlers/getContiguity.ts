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

/**
 * Shared React Query key for the per-district contiguity check. Every observer
 * builds its key here so they share one cache entry and the keys can't drift
 * apart; `updated_at` turns the key over on every save.
 */
export const contiguityQueryKey = (mapDocument?: DocumentObject | null) =>
  ['Contiguity', mapDocument?.document_id, mapDocument?.updated_at] as const;

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
