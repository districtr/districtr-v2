import axios from 'axios';
import {MapGroup} from './types';
import {API_URL} from '../constants';

export const getGroup = async (group_slug: string): Promise<MapGroup> => {
  return await axios.get(`${API_URL}/api/group/${group_slug}`).then(res => {
    return res.data;
  });
};
