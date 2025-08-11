import axios from 'axios';
import {CommentListing} from './types';
import {API_URL} from '../constants';

export const getDocumentComments = async (document_id: string): Promise<CommentListing[]> => {
  const url = new URL(`${API_URL}/api/comments/doc/${document_id}`);

  return await axios.get(url.toString()).then(res => {
    return res.data;
  });
};
