import axios from 'axios';
import {DistrictrMap} from './types';
import {API_URL} from '../constants';

export const getAvailableDistrictrMaps = async (
  slug = '',
  limit = 10,
  offset = 0
): Promise<DistrictrMap[]> => {
  const groupQuery = slug.length ? `&group=${slug}` : '';
  return await axios
    .get(`${API_URL}/api/gerrydb/views?limit=${limit}&offset=${offset}${groupQuery}`)
    .then(res => {
      return res.data;
    });
};
