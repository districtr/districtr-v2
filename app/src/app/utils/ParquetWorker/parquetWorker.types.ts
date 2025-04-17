import {DocumentObject} from '../api/apiHandlers/types';
import {AsyncBuffer, FileMetaData} from 'hyparquet';
import {PossibleColumnsOfSummaryStatConfig} from '../api/summaryStats';

type DistrictrView = string;
export interface ExtendedFileMetaData extends FileMetaData {
  rows: Record<string, [number, number]>;
  columns: string[];
}
type MetaInfo = {
  metadata: ExtendedFileMetaData;
  url: string;
  byteLength: number;
  file: AsyncBuffer;
};
export type ColumnarTableData = {
  path: string[];
  sourceLayer: string[];
} & {
  [K in PossibleColumnsOfSummaryStatConfig[number]]?: number[];
};

/**
 * Represents a class that handles parquet operations.
 */
export type ParquetWorkerClass = {
  _metaCache: Record<DistrictrView, MetaInfo>;

  /**
   * Get the demography for a given map document and broken ids.
   * @param mapDocument - The map document.
   * @param brokenIds - The broken ids.
   * @returns The demography.
   */
  getDemography: (
    mapDocument: DocumentObject,
    brokenIds?: string[]
  ) => Promise<{columns: PossibleColumnsOfSummaryStatConfig[number][]; results: ColumnarTableData}>;
  getRowSet: (view: DocumentObject, id: string, ignoreIds?: string[]) => Promise<ColumnarTableData>;
  getMetaData: (slug: DistrictrView) => Promise<MetaInfo>;
};
