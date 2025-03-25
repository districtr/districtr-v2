import axios from 'axios';
import { DocumentObject } from './types';

export const getContiguity = async (mapDocument: DocumentObject): Promise<any> => {
  if (mapDocument) {
    return await axios
      .get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/document/${mapDocument.document_id}/contiguity`,
        {}
      )
      .then(res => {
        return res.data;
      });
  } else {
    throw new Error('No document provided');
  }
};