import {DocumentObject} from './types';
import ParquetWorker from '../../ParquetWorker';
import {ColumnarTableData} from '../../ParquetWorker/parquetWorker.types';
import {AllTabularColumns} from '../summaryStats';

export const getDemography = async ({
  mapDocument,
  brokenIds,
  childrenOnly,
}: {
  mapDocument?: DocumentObject;
  brokenIds?: string[];
  /** Only the blocks of brokenIds (see ParquetWorker.getDemography). */
  childrenOnly?: boolean;
}): Promise<{
  columns: AllTabularColumns[number][];
  results: ColumnarTableData;
}> => {
  if (!mapDocument) {
    throw new Error('No document id provided');
  }
  if (!ParquetWorker) {
    throw new Error('ParquetWorker not found');
  }
  const demographyData = await ParquetWorker.getDemography(mapDocument, brokenIds, childrenOnly);
  return {
    columns: demographyData.columns,
    results: demographyData.results,
  };
};
