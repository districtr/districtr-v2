import {expose} from 'comlink';
import {
  ColumnarTableData,
  DemographyParquetData,
  MetaInfo,
  ParquetWorkerClass,
  PointParquetData,
} from './parquetWorker.types';
import {compressors} from 'hyparquet-compressors';
import {byteLengthFromUrl, asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects} from 'hyparquet';
import {AllTabularColumns} from '../api/summaryStats';
import {GEODATA_URL, PARQUET_URL} from '../api/constants';
import {
  enhanceAsyncBufferWithRangeGroups,
  EnhancedAsyncBuffer,
  mergeByteRanges,
} from './parquetWorkerUtils';

const ParquetWorker: ParquetWorkerClass = {
  _metaCache: {},
  _idRgCache: {},

  async getMetaData(url, enablePrefetch = true) {
    if (this._metaCache[url]) {
      return this._metaCache[url];
    }
    const byteLength = await byteLengthFromUrl(url).then(Number);
    let file = await asyncBufferFromUrl({url, byteLength});

    // Enhance buffer with multi-range prefetch capability
    if (enablePrefetch) {
      file = enhanceAsyncBufferWithRangeGroups(file, {
        url,
        fetchInit: {mode: 'cors', credentials: 'omit'},
        maxPartsPerRequest: 24,
        maxGap: 64 * 1024, // 64KB gap threshold for merging ranges
      });
    }

    const metadata = await parquetMetadataAsync(file);
    this._metaCache[url] = {
      metadata,
      url,
      byteLength,
      file,
    };
    return this._metaCache[url];
  },

  getRowGroupIndicesFromParentValue(meta, value, value_col = 'parent_path') {
    const rowGroupIndices: number[] = [];
    if (!meta.metadata.row_groups.length) {
      throw new Error('No row groups found');
    }
    const parent_path_col_index = meta.metadata.row_groups[0].columns.findIndex(f =>
      f.meta_data?.path_in_schema.includes(value_col)
    );
    if (parent_path_col_index === -1) {
      throw new Error('No parent path column found');
    }
    for (let i = 0; i < meta.metadata.row_groups.length; i++) {
      const rg = meta.metadata.row_groups[i];
      const {min, max} = rg.columns[parent_path_col_index].meta_data?.statistics || {};
      if (min === undefined || max === undefined) {
        throw new Error('No statistics found');
      }
      if (min <= value && max >= value) {
        rowGroupIndices.push(i);
      }
      if (max > value) {
        break;
      }
    }
    return rowGroupIndices;
  },

  getRowGroupsFromParentValue(meta, value, value_col = 'parent_path') {
    const rowGroupIndices = this.getRowGroupIndicesFromParentValue(meta, value, value_col);
    if (rowGroupIndices.length === 0) {
      throw new Error('No matching row groups found');
    }
    const rg_length = Number(meta.metadata.row_groups[0].num_rows);
    const rgRanges = rowGroupIndices.map(i => [i * rg_length, (i + 1) * rg_length]).flat();
    const rowRange: [number, number] = [rgRanges[0], rgRanges[rgRanges.length - 1]];
    return rowRange;
  },

  getRowGroupsFromChildValue(meta, values, values_col = 'path') {
    const rowGroups = [];
    if (!meta.metadata.row_groups.length) {
      throw new Error('No row groups found');
    }
    const path_col_index = meta.metadata.row_groups[0].columns.findIndex(f =>
      f.meta_data?.path_in_schema.includes(values_col)
    );
    const rg_length = Number(meta.metadata.row_groups[0].num_rows);
    if (path_col_index === -1) {
      throw new Error('No path column found');
    }
    let valueMin: string | undefined = undefined;
    let valueMax: string | undefined = undefined;
    for (const value of values) {
      if (valueMin === undefined || value < valueMin) {
        valueMin = value;
      }
      if (valueMax === undefined || value > valueMax) {
        valueMax = value;
      }
    }
    if (valueMin === undefined || valueMax === undefined) {
      throw new Error('No statistics found');
    }
    for (let i = 0; i < meta.metadata.row_groups.length; i++) {
      const rg = meta.metadata.row_groups[i];
      const {min, max} = rg.columns[path_col_index].meta_data?.statistics || {};
      if (min === undefined || max === undefined) {
        throw new Error('No statistics found');
      }
      if (min <= valueMin && max >= valueMax) {
        rowGroups.push(i);
      }
    }
    const rgRanges = rowGroups.map(i => [i * rg_length, (i + 1) * rg_length]).flat();
    const rowRange: [number, number] = [rgRanges[0], rgRanges[rgRanges.length - 1]];
    return rowRange;
  },

  getByteRangesForRowGroups(meta, rowGroupIndices, columnNames) {
    const ranges: Array<[number, number]> = [];

    // Get column indices if column names provided
    let columnIndices: number[] | undefined;
    if (columnNames && meta.metadata.row_groups[0]) {
      columnIndices = [];
      for (let i = 0; i < meta.metadata.row_groups[0].columns.length; i++) {
        const col = meta.metadata.row_groups[0].columns[i];
        const colName = col.meta_data?.path_in_schema?.[0];
        if (colName && columnNames.includes(colName)) {
          columnIndices.push(i);
        }
      }
    }

    for (const rgIndex of rowGroupIndices) {
      const rowGroup = meta.metadata.row_groups[rgIndex];
      if (!rowGroup) continue;

      const columns = columnIndices
        ? columnIndices.map(i => rowGroup.columns[i]).filter(Boolean)
        : rowGroup.columns;

      for (const col of columns) {
        const colMeta = col.meta_data;
        if (!colMeta) continue;

        // Use dictionary_page_offset if available, otherwise data_page_offset
        const startOffset = colMeta.dictionary_page_offset ?? colMeta.data_page_offset;
        if (startOffset === undefined) continue;

        const start = Number(startOffset);
        const size = Number(colMeta.total_compressed_size ?? 0);
        if (size > 0) {
          ranges.push([start, start + size]);
        }
      }
    }

    return ranges;
  },

  async prefetchByteRanges(meta, byteRanges) {
    const enhancedFile = meta.file as EnhancedAsyncBuffer;
    if (enhancedFile.prefetch) {
      const mergedRanges = mergeByteRanges(byteRanges);
      await enhancedFile.prefetch(mergedRanges);
    }
  },

  async getRowRange<T = object>(url: string, range: [number, number] | undefined, columns?: string[]) {
    const meta = await this.getMetaData(url);
    return (await parquetReadObjects({
      file: meta.file,
      columns: columns ?? undefined,
      compressors,
      rowStart: range?.[0],
      rowEnd: range?.[1],
    })) as T[];
  },

  mergeRanges(ranges) {
    // First, normalize each range so start <= end
    const normalized = ranges.map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as [number, number]);
    // Sort by the start of each range
    normalized.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const [start, end] of normalized) {
      if (merged.length === 0) {
        merged.push([start, end]);
        continue;
      }

      const last = merged[merged.length - 1];
      if (start <= last[1] + 1) {
        // Extend the previous range
        last[1] = Math.max(last[1], end);
      } else {
        // Start a new range
        merged.push([start, end]);
      }
    }

    return merged;
  },

  parseDemographyData(data, mapDocument, brokenIds) {
    const brokenIdsSet = new Set(brokenIds);
    // Optimize: single pass to build columnarData directly, avoid intermediate wideDataDict and double iteration
    const columnarData: ColumnarTableData = {
      path: [],
      sourceLayer: [],
    };

    // We'll keep track of which columns we've seen to initialize arrays only once
    const seenColumns = new Set<string>();

    for (let i = 0; i < data.length; i++) {
      const {parent_path, path, column_name, value} = data[i];
      const isParent = parent_path === '__parent';
      const idInSet = isParent ? brokenIdsSet.has(path) : brokenIdsSet.has(parent_path);

      // Skip rows based on the original logic
      if ((isParent && idInSet) || (!isParent && !idInSet)) {
        continue;
      }
      // Add path and sourceLayer only once per unique path
      if (columnarData.path.length === 0 || columnarData.path[columnarData.path.length - 1] !== path) {
        columnarData.path.push(path);
        columnarData.sourceLayer.push(isParent ? mapDocument.parent_layer! : mapDocument.child_layer!);
      }
      // Initialize column if not already
      if (!seenColumns.has(column_name)) {
        columnarData[column_name as AllTabularColumns[number]] = [];
        seenColumns.add(column_name);
      }
      // Push value to the correct column
      columnarData[column_name as AllTabularColumns[number]]!.push(value as number);
    }
    return columnarData as ColumnarTableData;
  },

  generateGeojsonFromPointData(pointData, layer, source, filterIds) {
    const features = [];
    for (const d of pointData) {
      if (filterIds && !filterIds.has(d.path)) {
        continue;
      }
      features.push({
        type: 'Feature',
        geometry: {type: 'Point', coordinates: [d.x, d.y]},
        properties: {
          path: d.path,
          // @ts-expect-error
          total_pop_20: parseInt(d.total_pop_20),
          __source: source,
          __sourceLayer: layer,
        },
      });
    }
    return {
      type: 'FeatureCollection',
      features,
    } as GeoJSON.FeatureCollection<GeoJSON.Point>;
  },

  async getDemography(mapDocument, brokenIds) {
    if (!mapDocument?.gerrydb_table) {
      return {columns: [], results: {path: [], sourceLayer: []}};
    }
    const url = `${PARQUET_URL}/tabular/${mapDocument.gerrydb_table}.parquet`;
    const meta = await this.getMetaData(url);

    // Collect all row group indices needed
    const allRowGroupIndices: number[] = [];
    const searchValues = ['__parent', ...(brokenIds || [])];

    for (const id of searchValues) {
      try {
        const indices = this.getRowGroupIndicesFromParentValue(meta, id, 'parent_path');
        allRowGroupIndices.push(...indices);
      } catch {
        // Skip if no matching row groups found for this value
      }
    }

    // Deduplicate row group indices
    const uniqueRowGroupIndices = [...new Set(allRowGroupIndices)].sort((a, b) => a - b);

    // Get byte ranges for these row groups (only for the columns we need)
    const columns = ['parent_path', 'path', 'column_name', 'value'];
    const byteRanges = this.getByteRangesForRowGroups(meta, uniqueRowGroupIndices, columns);

    // Prefetch all byte ranges in a single multi-range request
    if (byteRanges.length > 0) {
      await this.prefetchByteRanges(meta, byteRanges);
    }

    // Now compute row ranges and fetch data (will hit cache)
    const ranges = this.mergeRanges(
      searchValues.map(id => {
        try {
          return this.getRowGroupsFromParentValue(meta, id, 'parent_path');
        } catch {
          return [0, 0] as [number, number];
        }
      }).filter(([start, end]) => start !== end)
    );

    const data = await Promise.all(
      ranges.map(range => this.getRowRange<DemographyParquetData>(url, range, columns))
    );
    const parsed = this.parseDemographyData(data.flat(), mapDocument, brokenIds);
    return {columns: Object.keys(parsed) as AllTabularColumns[number][], results: parsed};
  },

  async getPointData(layer, columns, source, filterIds) {
    const url = `${GEODATA_URL}/tilesets/${layer}_points.parquet`;
    const meta = await this.getMetaData(url);
    let idRange: [number, number] | undefined = undefined;
    if (filterIds && filterIds.size > 0) {
      idRange = this.getRowGroupsFromChildValue(meta, Array.from(filterIds), 'path');
    }
    const parquetData = await this.getRowRange<PointParquetData>(url, idRange, columns);
    return this.generateGeojsonFromPointData(parquetData, layer, source, filterIds);
  },
};

expose(ParquetWorker);
