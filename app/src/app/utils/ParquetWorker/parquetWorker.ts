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

// Threshold at which we flip to "local scan" mode
const LOCAL_SCAN_ID_THRESHOLD = 20; // tune
const MAX_WHOLE_FILE_MB = 200; // safety cap to avoid huge downloads

const ParquetWorker: ParquetWorkerClass = {
  _metaCache: {},
  // Simple per-URL local buffer cache
  _localFileBufferCache: {},
  _fetching: {},

  async _ensureLocalAsyncBuffer(url: string, expectedByteLength?: number) {
    if (this._localFileBufferCache[url]) return this._localFileBufferCache[url].file;

    // Prefer OPFS when available (works inside Web Workers)
    const hasOPFS =
      typeof navigator !== 'undefined' &&
      (navigator as any).storage &&
      (navigator as any).storage.getDirectory;
    try {
      if (hasOPFS) {
        const root = await (navigator as any).storage.getDirectory(); // OPFS root
        const dir = await root.getDirectoryHandle('parquet-cache', {create: true});
        const key = encodeURIComponent(url);
        const fh = await dir.getFileHandle(key, {create: true});

        // Re-download if missing or size mismatch
        let fileObj = await fh.getFile().catch(() => undefined as any);
        if (
          !fileObj ||
          (expectedByteLength && Number(fileObj.size) !== Number(expectedByteLength))
        ) {
          const res = await fetch(url, {credentials: 'omit'});
          if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
          const writable = await fh.createWritable();
          if (res.body) {
            await res.body.pipeTo(writable); // stream network → disk; no full-buffer in RAM
          } else {
            // Fallback if body is not a stream
            const ab = await res.arrayBuffer();
            await writable.write(new Uint8Array(ab));
            await writable.close();
          }
          fileObj = await fh.getFile();
        }

        const file = {
          byteLength: Number(fileObj.size),
          async slice(start: number, end?: number) {
            return await fileObj.slice(start, end).arrayBuffer();
          },
        };
        this._localFileBufferCache[url] = {file, byteLength: file.byteLength};
        return file;
      }
    } catch (e) {
      // fall through to blob fallback
    }

    // Fallback: download to Blob (may hold in RAM depending on browser)
    console.log('Falling back to blob download');
    const res = await fetch(url, {credentials: 'omit'});
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    const blob = await res.blob();
    const file = {
      byteLength: blob.size,
      slice: (start: number, end?: number) => blob.slice(start, end).arrayBuffer(),
    };
    this._localFileBufferCache[url] = {file, byteLength: blob.size};
    return file;
  },
  _getRowGroupBoundaries(meta: Awaited<ReturnType<typeof ParquetWorker.getMetaData>>) {
    const starts: number[] = [];
    const ends: number[] = [];
    let cursor = 0;
    for (const rg of meta.metadata.row_groups) {
      starts.push(cursor);
      cursor += Number(rg.num_rows);
      ends.push(cursor); // exclusive
    }
    return {starts, ends};
  },
  _makeDemographyAccumulator(mapDocument, brokenIds) {
    return {
      mapDocument,
      brokenIdsSet: new Set(brokenIds || []),
      indexByPath: new Map<string, number>(),
      path: [] as string[],
      sourceLayer: [] as string[],
      columns: {} as Record<string, number[]>,
    };
  },
  _accumulateDemographyRows(acc, rows: DemographyParquetData[]) {
    const {brokenIdsSet, mapDocument} = acc;
    for (const r of rows) {
      const isParent = r.parent_path === '__parent';
      const idInSet = isParent ? brokenIdsSet.has(r.path) : brokenIdsSet.has(r.parent_path);
      // Keep exactly the same semantics as your original parseDemographyData
      if ((isParent && idInSet) || (!isParent && !idInSet)) continue;

      let idx = acc.indexByPath.get(r.path);
      if (idx === undefined) {
        idx = acc.path.length;
        acc.indexByPath.set(r.path, idx);
        acc.path.push(r.path);
        acc.sourceLayer.push(isParent ? mapDocument.parent_layer! : mapDocument.child_layer!);
        // keep existing column arrays aligned (holes are ok; we finalize later)
        for (const arr of Object.values(acc.columns))
          if (arr.length < acc.path.length) arr.length = acc.path.length;
      }

      const col = r.column_name as AllTabularColumns[number];
      let arr = acc.columns[col];
      if (!arr) {
        arr = acc.columns[col] = new Array(acc.path.length);
      } else if (arr.length < acc.path.length) {
        arr.length = acc.path.length;
      }
      arr[idx] = Number(r.value);
    }
  },
  _finalizeDemographyAccumulator(acc) {
    const out: ColumnarTableData = {path: acc.path, sourceLayer: acc.sourceLayer} as any;
    for (const [k, arr] of Object.entries(acc.columns)) {
      if (arr.length !== acc.path.length) arr.length = acc.path.length;
      out[k as AllTabularColumns[number]] = arr;
    }
    return out;
  },

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
    if (this._fetching.demography) {
      return null;
    }
    this._fetching.demography = true;
    console.log('!!!getDemography', mapDocument, brokenIds);
    const url = `${PARQUET_URL}/tabular/${mapDocument.gerrydb_table}.parquet`;
    const meta = await this.getMetaData(url);
    const fileMB = Number(meta.byteLength) / (1024 * 1024);
    const idCount = (brokenIds?.length ?? 0) + 1; // +1 for '__parent'
    const useLocal = idCount >= LOCAL_SCAN_ID_THRESHOLD && fileMB <= MAX_WHOLE_FILE_MB;

    const columns = ['parent_path', 'path', 'column_name', 'value'];

    if (useLocal) {
      // 1 GET → OPFS, then scan RG-by-RG (bounded memory)
      const localFile = await this._ensureLocalAsyncBuffer(url, meta.byteLength);
      const ranges = this.mergeRanges(
        ['__parent', ...(brokenIds || [])].map(id =>
          this.getRowGroupsFromParentValue(meta, id, 'parent_path')
        )
      );
      const acc = this._makeDemographyAccumulator(mapDocument, brokenIds);
      for (let i = 0; i < ranges.length; i++) {
        const rows = await parquetReadObjects({
          file: localFile,
          columns,
          compressors,
          rowStart: ranges[i][0],
          rowEnd: ranges[i][1],
        });
        this._accumulateDemographyRows(acc, rows as DemographyParquetData[]);
      }
      const parsed = this._finalizeDemographyAccumulator(acc);
      return {columns: Object.keys(parsed) as AllTabularColumns[number][], results: parsed};
    }

    // Small query path: keep your existing targeted partial reads
    const ranges = this.mergeRanges(
      ['__parent', ...(brokenIds || [])].map(id =>
        this.getRowGroupsFromParentValue(meta, id, 'parent_path')
      )
    );
    const data = await Promise.all(
      ranges.map(range => this.getRowRange<DemographyParquetData>(url, range, columns))
    );
    const parsed = this.parseDemographyData(data.flat(), mapDocument, brokenIds);
    this._fetching.demography = false;
    return {columns: Object.keys(parsed) as AllTabularColumns[number][], results: parsed};
  },
  async getPointData(layer, columns, source, filterIds) {
    if (this._fetching.points) {
      return null;
    }
    this._fetching.points = true;
    const url = `${GEODATA_URL}/tilesets/${layer}_points.parquet`;
    const meta = await this.getMetaData(url);

    const fileMB = Number(meta.byteLength) / (1024 * 1024);
    const filterCount = filterIds?.size ?? 0;
    const useLocal = filterCount >= LOCAL_SCAN_ID_THRESHOLD && fileMB <= MAX_WHOLE_FILE_MB;

    // Ensure we always have 'path', 'x', 'y' for GeoJSON
    const cols = Array.from(new Set(['path', 'x', 'y', ...columns]));

    if (useLocal) {
      const localFile = await this._ensureLocalAsyncBuffer(url, meta.byteLength);
      const {starts, ends} = this._getRowGroupBoundaries(meta);

      const features: any[] = [];
      const allow = filterIds ? new Set(filterIds) : undefined;

      for (let i = 0; i < starts.length; i++) {
        const rows = await parquetReadObjects({
          file: localFile,
          columns: cols,
          compressors,
          rowStart: starts[i],
          rowEnd: ends[i],
        });

        for (const d of rows) {
          if (allow && !allow.has(d.path)) continue;
          features.push({
            type: 'Feature',
            geometry: {type: 'Point', coordinates: [d.x, d.y]},
            properties: {
              path: d.path,
              total_pop_20: Number((d as any).total_pop_20),
              __source: source,
              __sourceLayer: layer,
            },
          });
        }
      }

      this._fetching.points = false;
      return {type: 'FeatureCollection', features} as GeoJSON.FeatureCollection<GeoJSON.Point>;
    }

    // Small query path: keep existing targeted reads
    const meta2 = meta; // alias
    let idRange: [number, number] | undefined = undefined;
    if (filterIds && filterIds.size > 0) {
      idRange = this.getRowGroupsFromChildValue(meta2, Array.from(filterIds), 'path');
    }
    const parquetData = await this.getRowRange<PointParquetData>(url, idRange, cols);
    return this.generateGeojsonFromPointData(parquetData, layer, source, filterIds);
  },
};

expose(ParquetWorker);
