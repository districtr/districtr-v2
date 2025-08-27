import {DocumentObject} from './types';
import ParquetWorker from '../../ParquetWorker';
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
} | null> => {
  if (!mapDocument) {
    throw new Error('No document id provided');
  }
  if (!ParquetWorker) {
    throw new Error('ParquetWorker not found');
  }
  const demographyData = await ParquetWorker.getDemography(mapDocument, brokenIds);
  if (!demographyData) {
    return null;
  }
  return {
    columns: demographyData.columns,
    results: demographyData.results,
  };
};
