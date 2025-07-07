import axios from 'axios';
import {DocumentCreate, DocumentObject} from './types';

export const createMapDocument = async (document: DocumentCreate): Promise<DocumentObject> => {
  if (!document.user_id) throw new Error('User ID is required');
  console.log('createMapDocument', document);
  return await axios
    .post(`${process.env.NEXT_PUBLIC_API_URL}/api/create_document`, document)
    .then(res => {
      return res.data;
    })
    .catch(err => {
      console.error(err);
      throw err;
    });
};
