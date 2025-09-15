import {DocumentObject} from './types';
import {ColumnarTableData} from '../../ParquetWorker/parquetWorker.types';
import {AllTabularColumns} from '../summaryStats';

export const getDemography = async ({
  mapDocument,
  brokenIds,
}: {
  mapDocument?: DocumentObject;
  brokenIds?: string[];
}): Promise<{
  columns: AllTabularColumns[number][];
  results: ColumnarTableData;
}> => {
  if (!mapDocument) {
    throw new Error('No document id provided');
  }
  const demographyData = await fetch('/api/demography', {
    method: 'POST',
    body: JSON.stringify({mapDocument, brokenIds}),
  });
  const demographyDataJson = await demographyData.json();
  return {
    columns: demographyDataJson.columns,
    results: demographyDataJson.results,
  };
};
