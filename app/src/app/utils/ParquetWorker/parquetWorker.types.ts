import {DocumentObject} from '../api/apiHandlers/types';
import {AsyncBuffer, FileMetaData} from 'hyparquet';
import {AllTabularColumns} from '../api/summaryStats';

// Handy alias for [rowStart, rowEndExclusive]
export type RowRange = [number, number];

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

// --- New helper types for the hybrid local-scan path ---

// Local file cache entry for OPFS/Blob-backed AsyncBuffer
export type LocalFileCacheEntry = {
  file: AsyncBuffer;
  byteLength: number;
};

// Row-group boundaries computed from metadata (no uniform RG size assumption)
export type RowGroupBoundaries = {
  starts: number[]; // rowStart for each RG
  ends: number[]; // rowEnd (exclusive) for each RG
};

// Accumulator used to build the columnar demography table during streaming scan
export type DemographyAccumulator = {
  mapDocument: DocumentObject;
  brokenIdsSet: Set<string>;
  indexByPath: Map<string, number>;
  path: string[];
  sourceLayer: string[];
  columns: Partial<Record<AllTabularColumns[number], number[]>>;
};

export type ParquetWorkerClass = {
  // Caches
  _metaCache: Record<string, MetaInfo>;
  _localFileBufferCache: Record<string, LocalFileCacheEntry>;

  // ---------- PUBLIC / EXISTING API ----------

  /**
   * Parse the demography data into a columnar table data.
   */
  parseDemographyData: (
    data: Array<DemographyParquetData>,
    mapDocument: DocumentObject,
    brokenIds?: string[]
  ) => ColumnarTableData;

  /**
   * Get the demography for a given map document and broken ids.
   */
  getDemography: (
    mapDocument: DocumentObject,
    brokenIds?: string[]
  ) => Promise<{columns: AllTabularColumns[number][]; results: ColumnarTableData}>;

  /**
   * Get the row range that covers the row-groups containing a given parent value.
   * (Used in the small-query path.)
   */
  getRowGroupsFromParentValue: (meta: MetaInfo, value: string, value_col: string) => RowRange;

  /**
   * Get the row range that covers the row-groups containing a set of child values.
   * (Used in the small-query path.)
   */
  getRowGroupsFromChildValue: (meta: MetaInfo, values: string[], values_col: string) => RowRange;

  /**
   * Get the data for a given range of rows (rowEnd exclusive).
   */
  getRowRange: <T = object>(
    url: string,
    range: RowRange | undefined,
    columns?: string[]
  ) => Promise<T[]>;

  /**
   * Get the metadata for a given parquet file. Cached after first call.
   */
  getMetaData: (url: string) => Promise<MetaInfo>;

  /**
   * Get point selection data with optional filtering by IDs.
   */
  getPointData: (
    layer: string,
    columns: string[],
    source: string,
    filterIds?: Set<string>
  ) => Promise<GeoJSON.FeatureCollection<GeoJSON.Point>>;

  // ---------- UTILS ----------

  /**
   * Merge overlapping/adjacent row ranges.
   */
  mergeRanges: (ranges: RowRange[]) => RowRange[];

  /**
   * Convert point rows to a GeoJSON FeatureCollection.
   */
  generateGeojsonFromPointData: (
    pointData: PointParquetData[],
    layer: string,
    source: string,
    filterIds?: Set<string>
  ) => GeoJSON.FeatureCollection<GeoJSON.Point>;

  // ---------- INTERNALS FOR LOCAL-SCAN MODE ----------

  /**
   * Ensure the parquet file is downloaded once and available as an AsyncBuffer
   * backed by OPFS (or Blob fallback). Returns a file-like AsyncBuffer.
   */
  _ensureLocalAsyncBuffer: (url: string, expectedByteLength?: number) => Promise<AsyncBuffer>;

  /**
   * Compute row-group boundaries (start/end rows) from metadata.
   */
  _getRowGroupBoundaries: (meta: MetaInfo) => RowGroupBoundaries;

  /**
   * Create/accumulate/finalize helpers for streaming demography aggregation.
   */
  _makeDemographyAccumulator: (
    mapDocument: DocumentObject,
    brokenIds?: string[]
  ) => DemographyAccumulator;

  _accumulateDemographyRows: (acc: DemographyAccumulator, rows: DemographyParquetData[]) => void;

  _finalizeDemographyAccumulator: (acc: DemographyAccumulator) => ColumnarTableData;
};
