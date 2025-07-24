import {DocumentObject} from '../api/apiHandlers/types';
import {AsyncBuffer, FileMetaData, parquetReadObjects} from 'hyparquet';
import {AllTabularColumns} from '../api/summaryStats';

type MetaInfo = {
  metadata: FileMetaData;
  url: string;
  byteLength: number;
  file: AsyncBuffer;
};

export type DemographyParquetData = {
  parent_path: string;
  path: string;
  column_name: string;
  value: number;
};

export type PointParquetData = {
  path: string;
  x: number;
  y: number;
  total_pop_20: number;
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
export type ParquetFileType = 'tabular' | 'points';

export type ParquetWorkerClass = {
  _metaCache: Record<string, MetaInfo>;
  _idRgCache: Record<string, [number, number]>;
  /**
   * Parse the demography data into a columnar table data.
   * @param data - The data to parse.
   * @param mapDocument - The map document.
   * @param brokenIds - The broken ids.
   * @returns The columnar table data.
   */
  parseDemographyData: (
    data: Array<DemographyParquetData>,
    mapDocument: DocumentObject,
    brokenIds?: string[]
  ) => ColumnarTableData;

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
   * Get the row groups for a given id.
   * @param meta - The metadata.
   * @param id - The id.
   * @returns The row groups.
   */
  getRowGroupsFromParentValue: (
    meta: MetaInfo,
    value: string,
    value_col: string
  ) => [number, number];
  /**
   * Get the row groups for a given value.
   * @param meta - The metadata.
   * @param values - The values.
   * @param values_col - The column name.
   * @returns The row groups.
   */
  getRowGroupsFromChildValue: (
    meta: MetaInfo,
    values: string[],
    values_col: string
  ) => [number, number];
  /**
   * Get the data for a given range of rows
   * @param url - The URL to the parquet file.
   * @param range - The range of rows to get.
   * @param columns - The columns to select.
   * @returns Promise<T[]> array of row objects
   */
  getRowRange: <T = object>(
    url: string,
    range: [number, number] | undefined,
    columns?: string[]
  ) => Promise<T[]>;
  /**
   * Get the metadata for a given parquet file. Caches, so this resolves instantly after the first call.
   * @param url - The full URL to the parquet file.
   * @returns The metadata.
   */
  getMetaData: (url: string) => Promise<MetaInfo>;
  /**
   * Get point selection data with optional filtering by IDs.
   * @param layer - The layer name.
   * @param columns - The columns to select.
   * @param filterIds - Optional set of IDs to filter by.
   * @returns Promise<any[]> array of point objects
   */
  getPointData: (
    layer: string,
    columns: string[],
    source: string,
    filterIds?: Set<string>
  ) => Promise<GeoJSON.FeatureCollection<GeoJSON.Point>>;
  // UTILS
  /**
   * Optimize requests for row ranges by merging overlapping ranges.
   * @param ranges - The ranges to merge.
   * @returns The merged ranges.
   */
  mergeRanges: (ranges: [number, number][]) => [number, number][];
  generateGeojsonFromPointData: (
    pointData: PointParquetData[],
    layer: string,
    source: string,
    filterIds?: Set<string>
  ) => GeoJSON.FeatureCollection<GeoJSON.Point>;
};
