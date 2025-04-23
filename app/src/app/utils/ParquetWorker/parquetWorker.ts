import {expose} from 'comlink';
import {ColumnarTableData, ParquetWorkerClass} from './parquetWorker.types';
import {compressors} from 'hyparquet-compressors';
import {parquetRead, byteLengthFromUrl, asyncBufferFromUrl, parquetMetadataAsync} from 'hyparquet';
import {AllTabularColumns, SummaryRecord} from '../api/summaryStats';

const ParquetWorker: ParquetWorkerClass = {
  _metaCache: {},
  _idRgCache: {},

  async getMetaData(view) {
    if (this._metaCache[view]) {
      return this._metaCache[view];
    }
    const url = `${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/tabular/${view}.parquet`;
    const byteLength = await byteLengthFromUrl(url).then(Number);
    const file = await asyncBufferFromUrl({url, byteLength});
    let metadata = await parquetMetadataAsync(file);
    this._metaCache[view] = {
      metadata,
      url,
      byteLength,
      file,
    };
    return this._metaCache[view];
  },
  getRowGroupsFromId(meta, id) {
    const rowGroups = [];
    if (!meta.metadata.row_groups.length) {
      throw new Error('No row groups found');
    }
    const parent_path_col_index = meta.metadata.row_groups[0].columns.findIndex(f =>
      f.meta_data?.path_in_schema.includes('parent_path')
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
      if (min <= id && max >= id) {
        rowGroups.push(i);
      }
      if (max > id) {
        break;
      }
    }
    const rgRanges = rowGroups.map(i => [i * rg_length, (i + 1) * rg_length]).flat();
    const rowRange: [number, number] = [rgRanges[0], rgRanges[rgRanges.length - 1]];
    return rowRange;
  },
  async getRowRange(mapDocument, range, brokenIds) {
    if (!mapDocument) {
      throw new Error('No map document provided');
    }
    const view = mapDocument.districtr_map_slug;
    const meta = await this.getMetaData(view);
    const [rowStart, rowEnd] = range;
    const brokenIdsSet = new Set(brokenIds);
    const wideDataDict: Record<string, Partial<SummaryRecord>> = {};
    await parquetRead({
      ...meta,
      compressors,
      onComplete: data => {
        for (const [parent_path, path, column_name, value] of data) {
          const isParent = parent_path === '__parent';
          const idInSet = isParent ? brokenIdsSet.has(path) : brokenIdsSet.has(parent_path);
          if ((isParent && idInSet) || (!isParent && !idInSet)) {
            continue;
          } else {
            if (!wideDataDict[path]) {
              wideDataDict[path] = {
                path: path,
                // if the first row is 0, then it's the parent layer, otherwise it is any child layer
                sourceLayer: isParent ? mapDocument.parent_layer! : mapDocument.child_layer!,
              } as Partial<SummaryRecord>;
            }
            wideDataDict[path][column_name as keyof SummaryRecord] = value;
          }
        }
      },
      rowStart,
      rowEnd,
    });
    let columnarData: ColumnarTableData = {
      path: [],
      sourceLayer: [],
    };
    Object.values(wideDataDict).forEach((row, i) => {
      if (i === 0) {
        Object.keys(row).forEach(key => {
          columnarData[key as AllTabularColumns[number]] = [
            row[key as keyof SummaryRecord] as number,
          ];
        });
      }
      Object.entries(row).forEach(([k, v]) => {
        columnarData[k as AllTabularColumns[number]]!.push(v as number);
      });
    });
    return columnarData as ColumnarTableData;
  },
  async getRowSet(mapDocument, id, ignoreIds) {
    if (!mapDocument) {
      throw new Error('No map document provided');
    }
    const meta = await this.getMetaData(mapDocument.districtr_map_slug);
    return this.getRowRange(mapDocument, this.getRowGroupsFromId(meta, id), ignoreIds);
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
  async getDemography(mapDocument, brokenIds) {
    const meta = await this.getMetaData(mapDocument.districtr_map_slug);
    const promises = this.mergeRanges(
      ['__parent', ...(brokenIds || [])].map(id => this.getRowGroupsFromId(meta, id))
    ).map(range => this.getRowRange(mapDocument, range, brokenIds));
    const data = await Promise.all(promises);

    const results = data[0];
    data.slice(1).forEach(entry => {
      Object.entries(entry).forEach(([k, v]) => {
        // @ts-ignore
        results[k].push(...v);
      });
    });

    return {columns: Object.keys(results) as AllTabularColumns[number][], results};
  },
};

expose(ParquetWorker);
