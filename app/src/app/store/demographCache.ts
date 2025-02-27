// @ts-nocheck
"use client"
import {all, desc, op, table} from 'arquero';
import type {ColumnTable} from 'arquero';
import {DocumentObject} from '../utils/api/apiHandlers';
import {BLOCK_SOURCE_ID} from '../constants/layers';
import {MapGeoJSONFeature} from 'maplibre-gl';
import {MapStore, useMapStore} from './mapStore';
import {useChartStore} from './chartStore';
import {
  P1TotPopSummaryStats,
  P4VapPopSummaryStats,
  SummaryStatKeys,
  SummaryTypes,
} from '../utils/api/summaryStats';
import {useMemo} from 'react';

const ID_COL = 'path';

const getRollups = (stats: Record<keyof SummaryTypes, boolean>) => {
  const rollups = {};
  Object.keys(stats).forEach(stat => {
    if (stat in SummaryStatKeys) {
      // @ts-ignore
      SummaryStatKeys[stat].forEach(key => {
        rollups[key] = op.sum(key);
      });
    }
  });
  return rollups;
};

const getPctDerives = (stats: Record<keyof SummaryTypes, boolean>) => ({
  other_pop_pct: !stats.P1 ? NaN : row => row['other_pop'] / row['total_pop'],
  asian_pop_pct: !stats.P1 ? NaN : row => row['asian_pop'] / row['total_pop'],
  amin_pop_pct: !stats.P1 ? NaN : row => row['amin_pop'] / row['total_pop'],
  nhpi_pop_pct: !stats.P1 ? NaN : row => row['nhpi_pop'] / row['total_pop'],
  black_pop_pct: !stats.P1 ? NaN : row => row['black_pop'] / row['total_pop'],
  white_pop_pct: !stats.P1 ? NaN : row => row['white_pop'] / row['total_pop'],
  two_or_more_races_pop_pct: !stats.P1 ? NaN : row => row['two_or_more_races_pop'] / row['total_pop'],
  hispanic_vap_pct: !stats.P4 ? NaN : row => row['hispanic_vap'] / row['total_vap'],
  non_hispanic_asian_vap_pct: !stats.P4 ? NaN : row => row['non_hispanic_asian_vap'] / row['total_vap'],
  non_hispanic_amin_vap_pct: !stats.P4 ? NaN : row => row['non_hispanic_amin_vap'] / row['total_vap'],
  non_hispanic_nhpi_vap_pct: !stats.P4 ? NaN : row => row['non_hispanic_nhpi_vap'] / row['total_vap'],
  non_hispanic_black_vap_pct: !stats.P4 ? NaN : row => row['non_hispanic_black_vap'] / row['total_vap'],
  non_hispanic_white_vap_pct: !stats.P4 ? NaN : row => row['non_hispanic_white_vap'] / row['total_vap'],
  non_hispanic_other_vap_pct: !stats.P4 ? NaN : row => row['non_hispanic_other_vap'] / row['total_vap'],
  non_hispanic_two_or_more_races_vap_pct: !stats.P4 ? NaN : row => row['non_hispanic_two_or_more_races_vap'] / row['total_vap'],
})

const getMaxRollups = (stats: Record<keyof SummaryTypes, boolean>) => {
  const rollups = {};
  Object.keys(stats).forEach(stat => {
    if (stat in SummaryStatKeys) {
      SummaryStatKeys[stat].forEach(key => {
        rollups[key] = op.max(key);
        if (!key.includes('total')) {
          rollups[key + '_pct'] = op.max(key + '_pct');
        }
      });
    }
  });
  return rollups;
};

class DemographyCache {
  table?: ColumnTable;
  zoneTable?: ColumnTable;

  populations: Array<Record<keyof SummaryTypes, number>> = [];
  hash: string = '';

  summaryStats: {
    P1?: P1TotPopSummaryStats;
    P4?: P4VapPopSummaryStats;
    idealpop?: number;
    totalPopulation?: number;
    maxValues?: Record<keyof SummaryTypes, number>;
  } = {};

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
    this.calculateSummaryStats();
    const zoneAssignments = useMapStore.getState().zoneAssignments;
    this.updatePopulations(zoneAssignments);
    this.hash = hash;
  }

  updateZoneTable(zoneAssignments: MapStore['zoneAssignments']) {
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
  getAvailableSummariesObject() {
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
  calculatePopulations(zoneAssignments?: MapStore['zoneAssignments']) {
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

    this.summaryStats.maxValues = populationsTable.rollup(getMaxRollups(availableStats)).objects()[0];
    this.populations = populationsTable.objects();

    return this.populations;
  }

  calculateSummaryStats() {
    if (!this.table) return;
    const availableStats = this.getAvailableSummariesObject();
    const summaries = this.table.rollup(getRollups(availableStats)).objects()[0];
    const mapDocument = useMapStore.getState().mapDocument;

    Object.keys(summaries).forEach(key => {
      const statKeys = SummaryStatKeys[key as keyof SummaryTypes];
      if (!statKeys) return;
      statKeys.forEach(stat => {
        this.summaryStats[key as keyof SummaryTypes][stat] = summaries[stat]
      });
    })

    this.summaryStats.totalPopulation = summaries.total_pop
    this.summaryStats.idealpop = summaries.total_pop / (mapDocument?.num_districts ?? 4)

    useChartStore.getState().setDataUpdateHash(`${performance.now()}`);
  }

  updatePopulations(zoneAssignments?: MapStore['zoneAssignments']) {
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
      // @ts-ignore
      .filter(row => Boolean(row.zone))
      // @ts-ignore
      .sort((a, b) => a.zone - b.zone);
    Object.entries(paintedChanges).forEach(([zone, pop]) => {
      // @ts-ignore
      const index = cleanedData.findIndex(row => row.zone === parseInt(zone));
      if (index !== -1) {
        // @ts-ignore
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
