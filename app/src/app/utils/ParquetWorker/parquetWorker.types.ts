import {DocumentObject} from '../api/apiHandlers/types';
import {AsyncBuffer, FileMetaData} from 'hyparquet';
import {AllTabularColumns} from '../api/summaryStats';

type DistrictrView = string;
export interface ExtendedFileMetaData extends FileMetaData {
  rows: Record<string, [number, number]>;
  columns: AllTabularColumns[number][];
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
  [K in AllTabularColumns[number]]?: number[];
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
  ) => Promise<{columns: AllTabularColumns[number][]; results: ColumnarTableData}>;
  /**
   * Get the data for a given range of rows
   * @param view - Districtr map DocumentObject
   * @param range - The range of rows to get.
   * @param ignoreIds - IDs to ignore/exclude from the data. Mostly for broken parents.
   * @returns Promise<ColumnarTableData> ready for Arquero.table
   */
  getRowRange: (view: DocumentObject, range: [number, number], ignoreIds?: string[]) => Promise<ColumnarTableData>;
  /**
   * Convenience method for getRowRange. Needs id instead of range and looks up the range in the metadata.
   * @param view - Districtr map DocumentObject
   * @param id - The id of the rows to get.
   * @param ignoreIds - IDs to ignore/exclude from the data. Mostly for broken parents.
   * @returns Promise<ColumnarTableData> ready for Arquero.table
   */
  getRowSet: (view: DocumentObject, id: string, ignoreIds?: string[]) => Promise<ColumnarTableData>;
  /**
   * Get the metadata for a given view. Caches, so this resolves instantly after the first call.
   * @param slug - The slug of the view.
   * @returns The metadata.
   */
  getMetaData: (slug: DistrictrView) => Promise<MetaInfo>;
  // UTILS
  /**
   * Optimize requests for row ranges by merging overlapping ranges.
   * @param ranges - The ranges to merge.
   * @returns The merged ranges.
   */
  mergeRanges: (ranges: [number, number][]) => [number, number][];
};
