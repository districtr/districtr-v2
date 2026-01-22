import {Overlay} from './types';
import {get} from '../factory';

export const getMapOverlays = async (districtr_map_slug: string) => {
  if (!districtr_map_slug) {
    return {
      ok: false,
      error: {
        detail: 'No districtr map slug provided',
      },
    } as const;
  }

  return await get<Overlay[]>(`districtrmap/${districtr_map_slug}/overlays`)({});
};
