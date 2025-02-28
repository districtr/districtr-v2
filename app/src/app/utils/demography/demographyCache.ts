'use client';
import {op, table} from 'arquero';
import type {ColumnTable} from 'arquero';
import {DocumentObject} from '../api/apiHandlers';
import {BLOCK_SOURCE_ID} from '../../constants/layers';
import {MapGeoJSONFeature} from 'maplibre-gl';
import {MapStore, useMapStore} from '../../store/mapStore';
import {useChartStore} from '../../store/chartStore';
import {
  P1TotPopSummaryStats,
  P1ZoneSummaryStats,
  P4VapPopSummaryStats,
  P4ZoneSummaryStats,
  SummaryStatKeys,
  SummaryTypes,
} from '../api/summaryStats';
import {useMemo} from 'react';
import {getMaxRollups, getPctDerives, getRollups} from './arquero';
import {MaxValues, SummaryRecord, SummaryTable} from './types';



/**
 * Class to organize queries on current demographic data
 */
class DemographyCache {
  /**
   * Arquero main data table.
   * Reflects the stats pulled from the api/document/{doc id}/demography endpoint
   */
  table?: ColumnTable;

  /**
   * The zone data table.
   * Updates to match the zone assignments in the state.
   */
  zoneTable?: ColumnTable;

  /**
   * The summary of populations.
   */
  populations: SummaryTable = [];

  /**
   * The hash representing the current state of the cache.
   */
  hash: string = '';

  /**
   * The column used for identifying rows.
   */
  id_col: string = 'path';

  /**
   * Available summary statistics / derived values.
   */
  summaryStats: {
    P1?: P1TotPopSummaryStats;
    P4?: P4VapPopSummaryStats;
    maxValues?: MaxValues;
    idealpop?: number;
    totalPopulation?: number;
  } = {};

  /**
   * Rotates the given columns and data rows from an 2D array into an arquero object.
   * Arquero expects an object with columnar arrays to make a table
   *
   * @param columns - The columns to rotate.
   * @param dataRows - The data rows to rotate.
   * @param childIds - The set of child IDs.
   * @param mapDocument - The map document object.
   * @returns The rotated data as an object.
   */
  rotate(
    columns: Array<string>,
    dataRows: Array<Array<string | number>>,
    childIds: Set<string>,
    mapDocument: DocumentObject
  ): Record<string, any> {
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

  /**
   * Updates this class with new data from the backend. 
   *
   * @param columns - The columns to update.
   * @param dataRows - The data rows to update.
   * @param excludeIds - The set of IDs to exclude.
   * @param childIds - The set of child IDs.
   * @param mapDocument - The map document object.
   * @param hash - The hash representing the new state.
   */
  update(
    columns: Array<string>,
    dataRows: Array<Array<string | number>>,
    excludeIds: Set<string> = new Set(),
    childIds: Set<string>,
    mapDocument: DocumentObject,
    hash: string
  ): void {
    if (hash === this.hash) return;
    const newTable = table(this.rotate(columns, dataRows, childIds, mapDocument));
    if (!this.table) {
      this.table = newTable;
    } else {
      const prevEntries = this.table.filter(row => !excludeIds.has(row['path']));
      this.table = prevEntries.concat(newTable);
    }
    this.calculateSummaryStats();
    const zoneAssignments = useMapStore.getState().zoneAssignments;
    this.updatePopulations(zoneAssignments);
    this.hash = hash;
  }

  /**
   * Updates the zone table with new zone assignments.
   *
   * @param zoneAssignments - The zone assignments to update.
   */
  updateZoneTable(zoneAssignments: MapStore['zoneAssignments']): void {
    const rows = zoneAssignments.size;
    const zoneColumns = {
      path: new Array(rows),
      zone: new Array(rows),
    };
    (zoneAssignments.entries() as any).forEach(([k, v]: any) => {
      if (!k || !v) return;
      zoneColumns.path.push(k);
      zoneColumns.zone.push(v);
    });
    this.zoneTable = table(zoneColumns);
  }

  /**
   * Clears the cache.
   */
  clear(): void {
    this.table = undefined;
    this.zoneTable = undefined;
    this.populations = [];
    this.summaryStats = {};
    this.hash = '';
  }

  /**
   * Gets the filtered data for a given ID.
   *
   * @param id - The ID to filter by.
   * @returns The filtered data.
   */
  getFiltered(id: string): MapGeoJSONFeature[] {
    if (!this.table) {
      return [];
    }
    const ids = this.table
      .select(this.id_col, 'sourceLayer', 'total_pop')
      .params({
        id: id,
        vtdId: `vtd:${id}`,
      })
      .filter(
        (row: any, $: {id: string; vtdId: string}) =>
          op.startswith(row['path'], $.id) || op.startswith(row['path'], $.vtdId)
      )
      .objects()
      .map((properties: any) => ({
        id: properties.path,
        sourceLayer: properties.sourceLayer,
        source: BLOCK_SOURCE_ID,
        properties,
      })) as MapGeoJSONFeature[];
    return ids;
  }

  /**
   * Gets the available summaries object.
   *
   * @returns The available summaries object.
   */
  getAvailableSummariesObject(): Record<keyof SummaryTypes, boolean> {
    const mapDocument = useMapStore.getState().mapDocument;
    if (!mapDocument?.available_summary_stats) {
      return {} as Record<keyof SummaryTypes, boolean>;
    }

    return mapDocument.available_summary_stats.reduce(
      (acc, stat) => {
        acc[stat] = true;
        return acc;
      },
      {} as Record<keyof SummaryTypes, boolean>
    );
  }

  /**
   * Calculates the populations based on zone assignments.
   *
   * @param zoneAssignments - The zone assignments to use for calculation.
   * @returns The calculated populations.
   */
  calculatePopulations(zoneAssignments?: MapStore['zoneAssignments']): SummaryTable {
    if (zoneAssignments) {
      this.updateZoneTable(zoneAssignments);
    }
    const availableStats = this.getAvailableSummariesObject();
    if (!this.table || !this.zoneTable || !Object.keys(availableStats).length) {
      return [];
    }

    const populationsTable = this.zoneTable
      .join_left(this.table, ['path', 'path'])
      .groupby('zone')
      .rollup(getRollups(availableStats))
      .derive(getPctDerives(availableStats));

    const maxRollups = populationsTable
      .rollup(getMaxRollups(availableStats))
      .objects()[0] as MaxValues;
    if (maxRollups) {
      this.summaryStats.maxValues = maxRollups;
    }
    this.populations = populationsTable.objects() as SummaryTable;

    return this.populations;
  }

  /**
   * Calculates the summary statistics.
   */
  calculateSummaryStats(): void {
    if (!this.table) return;
    const availableStats = this.getAvailableSummariesObject();
    const summaries = this.table.rollup(getRollups(availableStats)).objects()[0] as SummaryRecord;
    const mapDocument = useMapStore.getState().mapDocument;

    Object.keys(availableStats).forEach((key) => {
      const summaryStats: Partial<P1ZoneSummaryStats & P4ZoneSummaryStats> = {};
      const statKeys = SummaryStatKeys[key as keyof SummaryTypes];
      if (!statKeys) return;
      statKeys.forEach(stat => summaryStats[stat] = summaries[stat]);
      this.summaryStats[key as keyof SummaryTypes] = summaryStats as P1TotPopSummaryStats & P4VapPopSummaryStats;
    });

    this.summaryStats.totalPopulation = summaries.total_pop;
    this.summaryStats.idealpop = summaries.total_pop / (mapDocument?.num_districts ?? 4);

    useChartStore.getState().setDataUpdateHash(`${performance.now()}`);
  }

  /**
   * Updates the populations based on zone assignments.
   *
   * @param zoneAssignments - The zone assignments to use for updating populations.
   */
  updatePopulations(zoneAssignments?: MapStore['zoneAssignments']): void {
    this.calculatePopulations(zoneAssignments);
    useChartStore.getState().setDataUpdateHash(`${performance.now()}`);
  }
}

export const demographyCache = new DemographyCache();

export const useDemography = () => {
  const hash = useChartStore(state => state.dataUpdateHash);
  const paintedChanges = useChartStore(state => state.paintedChanges);
  const populationData = useMemo(() => {
    let cleanedData = structuredClone(demographyCache.populations)
      .filter(row => Boolean(row.zone))
      .sort((a, b) => a.zone - b.zone);
    Object.entries(paintedChanges).forEach(([zone, pop]) => {
      const index = cleanedData.findIndex(row => row.zone === parseInt(zone));
      if (index !== -1) {
        cleanedData[index].total_pop += pop;
      }
    });
    return cleanedData;
  }, [hash, paintedChanges]);
  return {
    populationData,
  } as any;
};

export const useSummaryStats = () => {
  const _hash = useChartStore(state => state.dataUpdateHash);
  return {
    ...demographyCache.summaryStats,
  };
};
