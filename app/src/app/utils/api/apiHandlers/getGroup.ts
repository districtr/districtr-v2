import axios from 'axios';
import {MapGroup} from './types';

export const getGroup = async (group_slug: string): Promise<MapGroup> => {
  return await axios.get(`http://backend:8000/api/group/${group_slug}`).then(res => {
    return res.data;
  });
};
