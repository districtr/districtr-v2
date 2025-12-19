import {expose} from 'comlink';
import {
  ColumnarTableData,
  DemographyParquetData,
  ParquetWorkerClass,
  PointParquetData,
} from './parquetWorker.types';
import {compressors} from 'hyparquet-compressors';
import {
  byteLengthFromUrl,
  asyncBufferFromUrl,
  parquetMetadataAsync,
  parquetReadObjects,
} from 'hyparquet';
import {AllTabularColumns} from '../api/summaryStats';
import {GEODATA_URL, PARQUET_URL} from '../api/constants';

const ParquetWorker: ParquetWorkerClass = {
  _metaCache: {},
  _idRgCache: {},

  async getMetaData(url) {
    if (this._metaCache[url]) {
      return this._metaCache[url];
    }
    const byteLength = await byteLengthFromUrl(url).then(Number);
    const file = await asyncBufferFromUrl({url, byteLength});
    let metadata = await parquetMetadataAsync(file);
    this._metaCache[url] = {
      metadata,
      url,
      byteLength,
      file,
    };
    return this._metaCache[url];
  },
  getRowGroupsFromParentValue(meta, value, value_col = 'parent_path') {
    const rowGroups = [];
    if (!meta.metadata.row_groups.length) {
      throw new Error('No row groups found');
    }
    const parent_path_col_index = meta.metadata.row_groups[0].columns.findIndex(f =>
      f.meta_data?.path_in_schema.includes(value_col)
    );
    const rg_length = Number(meta.metadata.row_groups[0].num_rows);
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
        rowGroups.push(i);
      }
      if (max > value) {
        break;
      }
    }
    const rgRanges = rowGroups.map(i => [i * rg_length, (i + 1) * rg_length]).flat();
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
  async getRowRange<T = object>(
    url: string,
    range: [number, number] | undefined,
    columns?: string[]
  ) {
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
      if (
        columnarData.path.length === 0 ||
        columnarData.path[columnarData.path.length - 1] !== path
      ) {
        columnarData.path.push(path);
        columnarData.sourceLayer.push(
          isParent ? mapDocument.parent_layer! : mapDocument.child_layer!
        );
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
    const ranges = this.mergeRanges(
      ['__parent', ...(brokenIds || [])].map(id =>
        this.getRowGroupsFromParentValue(meta, id, 'parent_path')
      )
    );
    const data = await Promise.all(
      ranges.map(range =>
        this.getRowRange<DemographyParquetData>(url, range, [
          'parent_path',
          'path',
          'column_name',
          'value',
        ])
      )
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
