import axios from 'axios';
import { DocumentObject } from './types';

export const getZoneConnectedComponentBBoxes = async (
  mapDocument: DocumentObject,
  zone: number
): Promise<any> => {
  if (mapDocument) {
    return await axios
      .get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/document/${mapDocument.document_id}/contiguity/${zone}/connected_component_bboxes`,
        {}
      )
      .then(res => {
        return res.data;
      });
  } else {
    throw new Error('No document provided');
  }
};