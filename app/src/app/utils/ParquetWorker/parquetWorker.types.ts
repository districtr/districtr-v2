import {DocumentObject} from '../api/apiHandlers/types';
import {AsyncBuffer, FileMetaData} from 'hyparquet';
import {AllTabularColumns} from '../api/summaryStats';

export type MetaInfo = {
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

/** What the worker exposes to the app. Only these cross the worker boundary. */
export type ParquetWorkerClass = Pick<ParquetWorkerInternals, 'getDemography' | 'getPointData'>;

export type ParquetWorkerInternals = {
  _metaCache: Record<string, MetaInfo>;

  /**
   * Get the metadata for a given parquet file. Results are cached, so subsequent
   * calls resolve instantly.
   * @param url - The full URL to the parquet file.
   * @returns The metadata and file buffer.
   */
  getMetaData: (url: string) => Promise<MetaInfo>;

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
