import axios from 'axios';
import {DocumentObject} from './types';
import {API_URL} from '../constants';

export const getPublicPlans = async (districtr_map_slug: string): Promise<DocumentObject[]> => {
  return await axios.get(`${API_URL}/api/documents/${districtr_map_slug}`).then(res => {
    return res.data;
  });
};
