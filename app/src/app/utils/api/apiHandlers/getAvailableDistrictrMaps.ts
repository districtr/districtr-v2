import axios from 'axios';
import {DistrictrMap} from './types';
import {API_URL} from '../constants';

interface AvailableDistrictrMapsParams {
  group?: string;
  limit?: number;
  offset?: number;
}

export const getAvailableDistrictrMaps = async ({
  group = 'states',
  limit = 1000,
  offset = 0,
}: AvailableDistrictrMapsParams): Promise<DistrictrMap[]> => {
  return await axios
    .get(`${API_URL}/api/gerrydb/views?limit=${limit}&offset=${offset}&group=${group}`)
    .then(res => {
      return res.data;
    });
};
