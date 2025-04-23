import axios from 'axios';
import {API_URL} from '@utils/api/constants';
import {DocumentObject} from './types';

export const getDocument = async (document_id: string): Promise<DocumentObject> => {
  if (document_id) {
    return await axios
      .post(`${API_URL}/api/document/${document_id}`, {
        user_id: '',
      })
      .then(res => {
        return res.data;
      });
  } else {
    throw new Error('No document id found');
  }
};
