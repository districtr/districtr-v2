import axios from 'axios';
import {DistrictrMap} from './types';
import { API_URL } from '../constants';

export const getAvailableDistrictrMaps = async (
  limit = 10,
  offset = 0
): Promise<DistrictrMap[]> => {
  return await axios
    .get(`${API_URL}/api/gerrydb/views?limit=${limit}&offset=${offset}`)
    .then(res => {
      return res.data;
    });
};
