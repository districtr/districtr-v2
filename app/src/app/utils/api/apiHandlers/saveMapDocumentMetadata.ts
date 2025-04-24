import axios from 'axios';
import {DocumentMetadata} from './types';

export const saveMapDocumentMetadata = async ({
  document_id,
  metadata,
}: {
  document_id: string;
  metadata: DocumentMetadata;
}) => {
  return await axios
    .put(`${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}/metadata`, metadata)
    .then(res => {
      return res.data;
    })
    .catch(err => {
      console.error(err);
      throw err;
    });
};
