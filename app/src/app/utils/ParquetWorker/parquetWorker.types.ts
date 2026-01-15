import {DocumentObject} from '../api/apiHandlers/types';
import {AsyncBuffer, FileMetaData} from 'hyparquet';
import {AllTabularColumns} from '../api/summaryStats';
import {EnhancedAsyncBuffer} from './parquetWorkerUtils';

export type MetaInfo = {
  metadata: FileMetaData;
  url: string;
  byteLength: number;
  file: AsyncBuffer | EnhancedAsyncBuffer;
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
   * Get the metadata for a given parquet file. Creates an enhanced buffer with
   * prefetch capabilities. Results are cached, so subsequent calls resolve instantly.
   * @param url - The full URL to the parquet file.
   * @param enablePrefetch - Whether to enable multi-range prefetch (default: true)
   * @returns The metadata and enhanced file buffer.
   */
  getMetaData: (url: string, enablePrefetch?: boolean) => Promise<MetaInfo>;

  /**
   * Get the row groups indices that contain a given parent value.
   * Uses statistics to efficiently skip irrelevant row groups.
   * @param meta - The metadata.
   * @param value - The value to search for.
   * @param value_col - The column name to search in.
   * @returns The row range [start, end] covering matching row groups.
   */
  getRowGroupsFromParentValue: (
    meta: MetaInfo,
    value: string,
    value_col?: string
  ) => [number, number];

  /**
   * Get the row groups indices that contain given child values.
   * @param meta - The metadata.
   * @param values - The values to search for.
   * @param values_col - The column name to search in.
   * @returns The row range [start, end] covering matching row groups.
   */
  getRowGroupsFromChildValue: (
    meta: MetaInfo,
    values: string[],
    values_col?: string
  ) => [number, number];

  /**
   * Get row group indices for a given parent value (for prefetch computation).
   * @param meta - The metadata.
   * @param value - The value to search for.
   * @param value_col - The column name to search in.
   * @returns Array of row group indices.
   */
  getRowGroupIndicesFromParentValue: (
    meta: MetaInfo,
    value: string,
    value_col?: string
  ) => number[];

  /**
   * Get byte ranges for specified row groups and columns for prefetching.
   * @param meta - The metadata.
   * @param rowGroupIndices - Row group indices to get byte ranges for.
   * @param columnNames - Column names to include (all if not provided).
   * @returns Array of [start, end] byte ranges.
   */
  getByteRangesForRowGroups: (
    meta: MetaInfo,
    rowGroupIndices: number[],
    columnNames?: string[]
  ) => Array<[number, number]>;

  /**
   * Prefetch byte ranges into the cache for efficient subsequent reads.
   * Only works if the file buffer supports prefetch (enhanced buffer).
   * @param meta - The metadata with enhanced file buffer.
   * @param byteRanges - Byte ranges to prefetch.
   */
  prefetchByteRanges: (meta: MetaInfo, byteRanges: Array<[number, number]>) => Promise<void>;

  /**
   * Get the data for a given range of rows.
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
   * Optimize requests for row ranges by merging overlapping ranges.
   * @param ranges - The ranges to merge.
   * @returns The merged ranges.
   */
  mergeRanges: (ranges: [number, number][]) => [number, number][];

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
   * Uses multi-range prefetch for efficient batch fetching.
   * @param mapDocument - The map document.
   * @param brokenIds - The broken ids.
   * @returns The demography columns and results.
   */
  getDemography: (
    mapDocument: DocumentObject,
    brokenIds?: string[]
  ) => Promise<{columns: AllTabularColumns[number][]; results: ColumnarTableData}>;

  /**
   * Get point selection data with optional filtering by IDs.
   * @param layer - The layer name.
   * @param columns - The columns to select.
   * @param source - The source identifier.
   * @param filterIds - Optional set of IDs to filter by.
   * @returns GeoJSON FeatureCollection of points
   */
  getPointData: (
    layer: string,
    columns: string[],
    source: string,
    filterIds?: Set<string>
  ) => Promise<GeoJSON.FeatureCollection<GeoJSON.Point>>;

  /**
   * Generate GeoJSON from point parquet data.
   * @param pointData - Array of point data objects.
   * @param layer - The layer name.
   * @param source - The source identifier.
   * @param filterIds - Optional set of IDs to filter by.
   * @returns GeoJSON FeatureCollection
   */
  generateGeojsonFromPointData: (
    pointData: PointParquetData[],
    layer: string,
    source: string,
    filterIds?: Set<string>
  ) => GeoJSON.FeatureCollection<GeoJSON.Point>;
};
