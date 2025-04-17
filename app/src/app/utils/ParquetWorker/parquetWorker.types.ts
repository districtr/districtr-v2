import {LngLatBoundsLike, MapGeoJSONFeature} from 'maplibre-gl';
import {DocumentObject} from '../api/apiHandlers/types';
import { FileMetaData } from 'hyparquet';

type DistrictrView = string;

/**
 * Represents a class that handles parquet operations.
 */
export type ParquetWorkerClass = {
  _metadataCache: Record<DistrictrView, FileMetaData>;
  _dataCache: Record<DistrictrView, Record<string, (number[] | string[])[]>>;
  _rowIndices: Record<DistrictrView, Record<string, [number, number]>>;

  /**
   * Get the demography for a given map document and broken ids.
   * @param mapDocument - The map document.
   * @param brokenIds - The broken ids.
   * @returns The demography.
   */
  getDemography: (
    mapDocument: DocumentObject,
    brokenIds?: string[]
  ) => Promise<FileMetaData>;

  getMetaData: (
    slug: DistrictrView
  ) => Promise<object>;

  getBrokenDemography: (
    mapDocument: DocumentObject,
    brokenIds?: string[]
  ) => Promise<{columns: string[]; results: (string | number)[][]; dataHash?: string}>;

  formatOutput: (
    mapDocument: DocumentObject,
    brokenIds?: string[]
  ) => Promise<{columns: string[]; results: (string | number)[][]; dataHash?: string}>;
};
