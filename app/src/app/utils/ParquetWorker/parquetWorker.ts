import {expose} from 'comlink';
import {
  ColumnarTableData,
  DemographyParquetData,
  ParquetWorkerInternals,
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
import {prefetchAsyncBuffer, rowGroupsContaining} from './parquetWorkerUtils';

const ParquetWorker: ParquetWorkerInternals = {
  _metaCache: {},

  async getMetaData(url) {
    if (this._metaCache[url]) {
      return this._metaCache[url];
    }
    const byteLength = await byteLengthFromUrl(url).then(Number);
    const file = await asyncBufferFromUrl({url, byteLength});
    const metadata = await parquetMetadataAsync(file);
    this._metaCache[url] = {
      metadata,
      url,
      byteLength,
      file,
    };
    return this._metaCache[url];
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

    // Read only the row groups that can hold these rows. Reading through a
    // metadata copy with just those groups, rather than by row offsets, keeps
    // hyparquet 1.12 from also fetching the group before each offset.
    const searchValues = ['__parent', ...(brokenIds || [])];
    const rowGroups = rowGroupsContaining(meta.metadata, 'parent_path', searchValues);
    const columns = ['parent_path', 'path', 'column_name', 'value'];
    const file = await prefetchAsyncBuffer(
      meta.file,
      url,
      this.getByteRangesForRowGroups(meta, rowGroups, columns)
    );
    const data = (await parquetReadObjects({
      file,
      metadata: {...meta.metadata, row_groups: rowGroups.map(i => meta.metadata.row_groups[i])},
      columns,
      compressors,
    })) as DemographyParquetData[];
    const parsed = this.parseDemographyData(data, mapDocument, brokenIds);
    return {columns: Object.keys(parsed) as AllTabularColumns[number][], results: parsed};
  },

  async getPointData(layer, columns, source, filterIds) {
    const url = `${GEODATA_URL}/tilesets/${layer}_points.parquet`;
    const meta = await this.getMetaData(url);
    let {file, metadata} = meta;
    if (filterIds && filterIds.size > 0) {
      // Read only the row groups that can contain filterIds
      const rowGroups = rowGroupsContaining(metadata, 'path', Array.from(filterIds));
      metadata = {...metadata, row_groups: rowGroups.map(i => metadata.row_groups[i])};
      file = await prefetchAsyncBuffer(
        file,
        url,
        this.getByteRangesForRowGroups(meta, rowGroups, columns)
      );
    }
    const parquetData = (await parquetReadObjects({
      file,
      metadata,
      columns,
      compressors,
    })) as PointParquetData[];
    return this.generateGeojsonFromPointData(parquetData, layer, source, filterIds);
  },
};

expose(ParquetWorker);
