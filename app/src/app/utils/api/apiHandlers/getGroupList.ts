import axios from 'axios';
import {MapGroup} from './types';
import {API_URL} from '../constants';

export const getGroupList = async (): Promise<MapGroup[]> => {
  return await axios.get(`${API_URL}/api/groups/list`).then(res => {
    return res.data;
  });
};
