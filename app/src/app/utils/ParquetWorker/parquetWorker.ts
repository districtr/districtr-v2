import {expose} from 'comlink';
import {
  ColumnarTableData,
  ExtendedFileMetaData,
  ParquetWorkerClass,
} from './parquetWorker.types';
import {compressors} from 'hyparquet-compressors';
import {parquetRead, byteLengthFromUrl, asyncBufferFromUrl, parquetMetadataAsync} from 'hyparquet';
import {DemographyRow, PossibleColumnsOfSummaryStatConfig, SummaryRecord} from '../api/summaryStats';

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
  async getRowSet(mapDocument, id, ignoreIds) {
    if (!mapDocument) {
      throw new Error('No map document provided');
    }
    const view = mapDocument.districtr_map_slug;
    const meta = await this.getMetaData(view);
    const [rowStart, rowEnd] = meta.metadata.rows[id];
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
              }
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
          columnarData[key as PossibleColumnsOfSummaryStatConfig[number]] = [row[key as keyof SummaryRecord] as number];
        });
      }
      Object.entries(row).forEach(([k, v]) => {
        columnarData[k as PossibleColumnsOfSummaryStatConfig[number]]!.push(v as number);
      });
    });
    return columnarData as ColumnarTableData;
  },
  async getDemography(mapDocument, brokenIds) {
    const meta = await this.getMetaData(mapDocument.districtr_map_slug);
    const columns = meta.metadata.columns as PossibleColumnsOfSummaryStatConfig[number][];
    const data = await Promise.all([
      this.getRowSet(mapDocument, 'parent', brokenIds),
      ...(brokenIds?.map(id => this.getRowSet(mapDocument, id)) ?? []),
    ]);

    const results = data[0];
    data.slice(1).forEach(entry => {
      Object.entries(entry).forEach(([k, v]) => {
        // @ts-ignore
        results[k].push(...v);
      });
    });
    return {columns, results};
  },
};

expose(ParquetWorker);
