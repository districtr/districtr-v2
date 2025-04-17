import {DocumentObject} from './types';
import ParquetWorker from '../../ParquetWorker';
import { ColumnarTableData } from '../../ParquetWorker/parquetWorker.types';
import { PossibleColumnsOfSummaryStatConfig } from '../summaryStats';

export const getDemography = async ({
  mapDocument,
  brokenIds,
}: {
  mapDocument?: DocumentObject;
  brokenIds?: string[];
}): Promise<{columns: PossibleColumnsOfSummaryStatConfig[]; results: ColumnarTableData}> => {
  if (!mapDocument) {
    throw new Error('No document id provided');
  }
  if (!ParquetWorker) {
    throw new Error('ParquetWorker not found');
  }
  const demographyData = await ParquetWorker.getDemography(mapDocument, brokenIds);
  console.log('!!!', demographyData);
  return {
    columns: demographyData.columns,
    results: demographyData.results,
  };
};
