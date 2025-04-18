import {expose} from 'comlink';
import {ColumnarTableData, ExtendedFileMetaData, ParquetWorkerClass} from './parquetWorker.types';
import {compressors} from 'hyparquet-compressors';
import {parquetRead, byteLengthFromUrl, asyncBufferFromUrl, parquetMetadataAsync} from 'hyparquet';
import {
  AllTabularColumns,
  SummaryRecord,
} from '../api/summaryStats';

const ParquetWorker: ParquetWorkerClass = {
  _metaCache: {},

  async getMetaData(view) {
    if (this._metaCache[view]) {
      return this._metaCache[view];
    }
    const url = `${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/tabular/${view}.parquet`;
    const byteLength = await byteLengthFromUrl(url).then(Number);
    const file = await asyncBufferFromUrl({url, byteLength});
    let metadata = (await parquetMetadataAsync(file)) as ExtendedFileMetaData;
    metadata['rows'] = JSON.parse(
      metadata['key_value_metadata']
        ?.find(f => f.key === 'length_list')
        ?.value?.replaceAll("'", '"') ?? '{}'
    );
    metadata['columns'] = JSON.parse(
      metadata['key_value_metadata']?.find(f => f.key === 'coplumn_list')?.value ?? '[]'
    );
    this._metaCache[view] = {
      metadata,
      url,
      byteLength,
      file,
    };
    return this._metaCache[view];
  },

  async getRowRange(mapDocument, range, ignoreIds) {
    if (!mapDocument) {
      throw new Error('No map document provided');
    }
    const view = mapDocument.districtr_map_slug;
    const meta = await this.getMetaData(view);
    const [rowStart, rowEnd] = range;
    const ignoreIdsSet = new Set(ignoreIds);
    const wideDataDict: Record<string, Partial<SummaryRecord>> = {};
    await parquetRead({
      ...meta,
      compressors,
      onComplete: data => {
        for (const [path, column_name, value] of data) {
          if (ignoreIdsSet.has(path)) {
            continue;
          } else {
            if (!wideDataDict[path]) {
              wideDataDict[path] = {
                // @ts-ignore intermediate format type issue :/
                path,
                sourceLayer:
                  path === 'parent' ? mapDocument.parent_layer! : mapDocument.child_layer!,
              };
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
    const range = meta.metadata.rows[id];
    return this.getRowRange(mapDocument, range, ignoreIds);
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
    const promises = this.mergeRanges(['parent', ...(brokenIds||[])].map(id => meta.metadata.rows[id]))
      .map(range => this.getRowRange(mapDocument, range, brokenIds));
    const data = await Promise.all(promises);

    const results = data[0];
    data.slice(1).forEach(entry => {
      Object.entries(entry).forEach(([k, v]) => {
        // @ts-ignore
        results[k].push(...v);
      });
    });
    return {columns: meta.metadata.columns, results};
  },
};

expose(ParquetWorker);
