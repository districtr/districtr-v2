import {expose} from 'comlink';
import {ParquetWorkerClass} from './parquetWorker.types';
import {compressors} from 'hyparquet-compressors';
import { parquetRead, byteLengthFromUrl, asyncBufferFromUrl, parquetMetadataAsync } from 'hyparquet';

const ParquetWorker: ParquetWorkerClass = {
  _metadataCache: {},
  _dataCache: {},
  _rowIndices: {},

  async getMetaData(view){
    if (this._metadataCache[view]){
      return this._metadataCache[view];
    }
    const url = `${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/tabular/${view}.parquet`;
    const byteLength = await byteLengthFromUrl(url).then(Number);
    const file = await asyncBufferFromUrl({url, byteLength});
    const metadata = await parquetMetadataAsync(file);
    this._metadataCache[view] = metadata;
    console.log('metadata', metadata);
    return metadata;
  },
  async getDemography(mapDocument, brokenIds){
    const metaData = await this.getMetaData(mapDocument.districtr_map_slug);
    return {columns: [], results: []};
  },
  async getBrokenDemography(mapDocument, brokenIds){
    const metaData = this._metadataCache[mapDocument.districtr_map_slug] ?? await this.getMetaData(mapDocument.districtr_map_slug);
    return {columns: [], results: []};
  },
  async formatOutput(mapDocument, brokenIds){
    return {columns: [], results: []};
  },
};

expose(ParquetWorker);
