import axios from 'axios';
import {DistrictrMap} from './types';

export const getAvailableDistrictrMaps = async (
  limit = 10,
  offset = 0
): Promise<DistrictrMap[]> => {
  return await axios
    .get(`${process.env.NEXT_PUBLIC_API_URL}/api/gerrydb/views?limit=${limit}&offset=${offset}`)
    .then(res => {
      return res.data;
    });
};
