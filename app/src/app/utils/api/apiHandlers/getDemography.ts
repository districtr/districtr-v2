import axios from 'axios';

export const getDemography = async ({
  document_id,
  ids,
  dataHash,
}: {
  document_id?: string;
  ids?: string[];
  dataHash?: string;
}): Promise<{columns: string[]; results: (string | number)[][]; dataHash?: string}> => {
  if (!document_id) {
    throw new Error('No document id provided');
  }
  const fetchUrl = new URL(
    `${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}/demography`
  );
  ids?.forEach(id => fetchUrl.searchParams.append('ids', id));
  const result = await axios.get(fetchUrl.toString()).then(res => res.data);
  return {
    columns: result.columns,
    results: result.results,
    dataHash: dataHash,
  };
};