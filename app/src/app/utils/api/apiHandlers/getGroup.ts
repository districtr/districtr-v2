import {MapGroup} from './types';
import {get} from '../factory';

export const getGroup = async (group_slug: string) => {
  return await get<MapGroup>(`group/${group_slug}`)({});
};
