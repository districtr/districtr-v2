import type {ShatterResult} from './types';
import {get} from '../factory';

export const getChildEdges = async ({
  districtr_map_slug,
  geoids,
}: {
  districtr_map_slug: string;
  geoids: string[];
}): Promise<ShatterResult> => {
  return await get<ShatterResult>(`gerrydb/edges/${districtr_map_slug}`)({
    queryParams: {
      parent_geoid: geoids,
    },
  }).then(res => {
    if (res.ok) {
      return res.response;
    } else {
      throw new Error(res.error.detail);
    }
  });
};
