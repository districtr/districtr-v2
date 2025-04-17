import axios from 'axios';
import {DocumentObject} from './types';

export const getDemography = async ({
  mapDocument,
  brokenIds,
  dataHash,
}: {
  mapDocument?: DocumentObject;
  brokenIds?: string[];
  dataHash?: string;
}): Promise<{columns: string[]; results: (string | number)[][]; dataHash?: string}> => {
  if (!mapDocument) {
    throw new Error('No document id provided');
  }
  // const fetchUrl = new URL(
  //   `${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}/demography`
  // );
  // ids?.forEach(id => fetchUrl.searchParams.append('ids', id));
  // const result = await axios.get(fetchUrl.toString()).then(res => res.data);
  return {
    columns: [], //result.columns,
    results: [], //result.results,
    dataHash: dataHash,
  };
};
