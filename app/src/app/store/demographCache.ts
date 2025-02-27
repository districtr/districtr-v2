import {all, desc, op, table} from 'arquero';
import type {ColumnTable} from 'arquero';
import {DocumentObject} from '../utils/api/apiHandlers';
import { BLOCK_SOURCE_ID } from '../constants/layers';
import { MapGeoJSONFeature } from 'maplibre-gl';

const ID_COL = 'path';
class DemographyCache {
  table?: ColumnTable;
  hash: string = '';

  rotate(
    columns: Array<string>,
    dataRows: Array<Array<string | number>>,
    childIds: Set<string>,
    mapDocument: DocumentObject
  ) {
    const output: Record<string, any> = {};
    for (let i = 0; i < columns.length; i++) {
      const column = columns[i];
      output[column] = dataRows.map(row => row[i]);
    }
    output.sourceLayer = dataRows.map(row =>
      childIds.has(row[0].toString()) ? mapDocument.child_layer : mapDocument.parent_layer
    );
    return output;
  }

  update(
    columns: Array<string>,
    dataRows: Array<Array<string | number>>,
    excludeIds: Set<string> = new Set(),
    childIds: Set<string>,
    mapDocument: DocumentObject,
    hash: string
  ) {
    if (hash === this.hash) return;
    const newTable = table(this.rotate(columns, dataRows, childIds, mapDocument));
    if (!this.table) {
      this.table = newTable;
    } else {
      const prevEntries = this.table.filter(row => !excludeIds.has(row['path']));
      this.table = prevEntries.concat(newTable);
    }
    this.hash = hash;
  }

  clear() {
    this.table = undefined;
  }
  getFiltered(id: string) {
    if (!this.table) {
      return [];
    }
    const t0 = performance.now();
    const ids = this.table
      .select(ID_COL, 'sourceLayer', 'total_pop')
      .params({
        id: id,
        vtdId: `vtd:${id}`,
      })
      .filter((row: any, $: {id: string, vtdId:string}) => op.startswith(row['path'], $.id) || op.startswith(row['path'], $.vtdId))
      .objects()
      .map((properties: any) => ({
        id: properties.path,
        sourceLayer: properties.sourceLayer,
        source: BLOCK_SOURCE_ID,
        properties,
      })) as MapGeoJSONFeature[];
    return ids;
  }
}

export const demographyCache = new DemographyCache();
