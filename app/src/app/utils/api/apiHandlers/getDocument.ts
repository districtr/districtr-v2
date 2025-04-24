import axios from 'axios';
import {DocumentObject} from './types';
import {useMapStore} from '@store/mapStore';

export const getDocument = async (
  idParam: { document_id?: string, row_number?: string | number }
): Promise<DocumentObject> => {
  const userID = useMapStore.getState().userID;
  
  // Check if we have either document_id or row_number
  if ((!idParam.document_id && !idParam.row_number) || !userID) {
    throw new Error('No valid document identifier found');
  }
  
  // Construct the API endpoint based on which ID type we have
  let endpoint: string;
  
  if (idParam.row_number) {
    endpoint = `${process.env.NEXT_PUBLIC_API_URL}/api/document/row/${idParam.row_number}`;
  } else if (idParam.document_id) {
    endpoint = `${process.env.NEXT_PUBLIC_API_URL}/api/document/${idParam.document_id}`;
  } else {
    throw new Error('No valid document identifier found');
  }
  
  return await axios
    .post(endpoint, {
      user_id: userID,
    })
    .then(res => {
      return res.data;
    });
};
