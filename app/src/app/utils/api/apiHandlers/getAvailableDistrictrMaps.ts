import {DistrictrMap} from './types';
import {get} from '../factory';

interface AvailableDistrictrMapsParams {
  group?: string;
  limit?: number;
  offset?: number;
}

export const getAvailableDistrictrMaps = async ({
  group = 'states',
  limit = 1000,
  offset = 0,
}: AvailableDistrictrMapsParams) => {
  return await get<DistrictrMap[]>('gerrydb/views')({
    queryParams: {
      group,
      limit,
      offset,
    },
  });
};
