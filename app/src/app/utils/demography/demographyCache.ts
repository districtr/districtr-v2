'use client';
import {op, table, escape} from 'arquero';
import type {ColumnTable} from 'arquero';
import {BLOCK_SOURCE_ID, FALLBACK_NUM_DISTRICTS} from '../../constants/layers';
import {MapGeoJSONFeature} from 'maplibre-gl';
import {MapStore, useMapStore} from '../../store/mapStore';
import {useChartStore} from '../../store/chartStore';
import {
  DemographyRow,
  MaxValues,
  PossibleColumnsOfSummaryStatConfig,
  SummaryRecord,
  SummaryStatConfig,
  summaryStatsConfig,
  summaryStatsWithPctConfig,
  SummaryTable,
  TableRow,
  TabularDataWithPercent,
} from '../api/summaryStats';
import {getPctDerives, getRollups} from './arquero';
import * as scale from 'd3-scale';
import {DEFAULT_COLOR_SCHEME, DEFAULT_COLOR_SCHEME_GRAY} from '@/app/store/demographyStore';
import {NullableZone} from '@/app/constants/types';
import {ColumnarTableData} from '../ParquetWorker/parquetWorker.types';
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

  availableColumns: PossibleColumnsOfSummaryStatConfig[number][] = [];

  /**
   * Available summary statistics / derived values.
   */
  summaryStats: {
    TOTPOP?: (typeof summaryStatsWithPctConfig)['TOTPOP'];
    VAP?: (typeof summaryStatsWithPctConfig)['VAP'];
    idealpop?: number;
    totalPopulation?: number;
    unassigned?: number;
  } = {};

  zoneStats: {
    maxValues?: MaxValues;
    maxPopulation?: number;
    minPopulation?: number;
    range?: number;
    paintedZones?: number;
  } = {};

  colorScale?: ReturnType<typeof scale.scaleThreshold<number, string>>;
  /**
   * Updates this class with new data from the backend.
   *
   * @param columns - The columns to update.
   * @param dataRows - The data rows to update.
   * @param mapDocument - The map document object.
   * @param hash - The hash representing the new state.
   */
  update(
    columns: PossibleColumnsOfSummaryStatConfig[number][],
    data: ColumnarTableData,
    hash: string
  ): void {
    if (hash === this.hash) return;
    this.table = table(data);
    this.availableColumns = columns;
    const zoneAssignments = useMapStore.getState().zoneAssignments;
    const popsOk = this.updatePopulations(zoneAssignments);
    if (!popsOk) return;
    this.calculateSummaryStats();
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
    Array.from(zoneAssignments.entries()).forEach(([k, v], i) => {
      if (!k || !v) return;
      zoneColumns.path[i] = k;
      zoneColumns.zone[i] = v;
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
    this.colorScale = undefined;
    this.zoneStats = {};
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
      .select(this.id_col, 'sourceLayer', 'total_pop_20')
      .params({
        id: id,
        vtdId: `vtd:${id}`,
      })
      .filter(
        (row: TableRow, $: {id: string; vtdId: string}) =>
          op.startswith(row['path'], $.id) || op.startswith(row['path'], $.vtdId)
      )
      .objects()
      .map((properties: TableRow) => ({
        id: properties.path,
        sourceLayer: properties.sourceLayer,
        source: BLOCK_SOURCE_ID,
        properties,
      })) as MapGeoJSONFeature[];
    return ids;
  }

  /**
   * Calculates the populations based on zone assignments.
   *
   * @param zoneAssignments - The zone assignments to use for calculation.
   * @returns The calculated populations.
   */
  calculatePopulations(
    zoneAssignments?: MapStore['zoneAssignments']
  ): {ok: true; table: SummaryTable} | {ok: false} {
    const t0 = performance.now();
    const numZones = useMapStore.getState().mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS;
    if (zoneAssignments) {
      this.updateZoneTable(zoneAssignments);
    }

    if (!this.table || !this.zoneTable) {
      return {
        ok: false,
      };
    }
    const joinedTable = this.table.join_full(this.zoneTable, ['path', 'path']);
    const missingPopulations = joinedTable.filter(
      escape(
        (row: TableRow & {zone: NullableZone}) =>
          row['total_pop_20'] === undefined && row['zone'] !== undefined
      )
    );

    if (missingPopulations.size) {
      console.log('Populations not yet loaded');
      return {
        ok: false,
      };
    }
    const columns = this.table.columnNames();
    // if any tot
    const populationsTable = joinedTable
      .groupby('zone')
      .rollup(getRollups(columns, 'sum'))
      .derive(getPctDerives(columns));

    const maxRollups = populationsTable
      .rollup(getRollups(columns, 'max'))
      .objects()[0] as MaxValues;

    if (maxRollups) {
      this.zoneStats.maxValues = maxRollups;
    }
    const zonePopulationsTable = populationsTable.objects() as SummaryTable;
    if (zonePopulationsTable.length + 1 !== numZones) {
      for (let i = 1; i < numZones + 1; i++) {
        if (!zonePopulationsTable.find(row => row.zone === i)) {
          // @ts-ignore
          zonePopulationsTable.push({zone: i, total_pop_20: 0});
        }
      }
    }
    this.populations = zonePopulationsTable.sort((a, b) => a.zone - b.zone);
    const popNumbers = this.populations
      .filter(row => row.zone !== undefined && row.zone !== null)
      .map(row => row.total_pop_20);
    this.zoneStats.maxPopulation = Math.max(...popNumbers);
    this.zoneStats.minPopulation = Math.min(...popNumbers);
    this.zoneStats.range = this.zoneStats.maxPopulation - this.zoneStats.minPopulation;
    this.summaryStats.unassigned = this.populations.find(f => !f.zone)?.total_pop_20 ?? 0;
    this.zoneStats.paintedZones = popNumbers.filter(pop => pop > 0).length;
    const t1 = performance.now();
    console.log(`calculatePopulations took ${t1 - t0} milliseconds`);
    return {
      ok: true,
      table: this.populations,
    };
  }

  /**
   * Calculates the summary statistics.
   */
  calculateSummaryStats(): void {
    if (!this.table) return;
    const t0 = performance.now();
    const columns = this.table.columnNames();
    this.table = this.table.derive(getPctDerives(columns));
    const summaries = this.table.rollup(getRollups(columns, 'sum')).objects()[0] as SummaryRecord;
    const mapDocument = useMapStore.getState().mapDocument;

    Object.entries(summaryStatsConfig).forEach(([key, config]) => {
      const summaryStats: Partial<DemographyRow> = {};
      config['possibleColumns'].forEach(col => (summaryStats[col] = summaries[col]));
      // @ts-ignore
      this.summaryStats[key] = summaryStats as SummaryRecord;
    });

    this.summaryStats.totalPopulation = summaries.total_pop_20;
    this.summaryStats.idealpop =
      summaries.total_pop_20 / (mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS);

    useChartStore.getState().setDataUpdateHash(`${performance.now()}`);
    const t1 = performance.now();
    console.log(`calculateSummaryStats took ${t1 - t0} milliseconds`);
  }

  /**
   * Helper to manage the arqueo quantile function.
   */
  calculateQuantiles(
    variable: string,
    numberOfBins: number
  ): {quantilesObject: {[q: string]: number}; quantilesList: number[]} | null {
    if (!this.table) return null;
    const rollups = new Array(numberOfBins + 1)
      .fill(0)
      .map((f, i) => (i === 0 ? i : Math.round((1 / numberOfBins) * i * 100) / 100))
      .reduce(
        (acc, curr, i) => {
          acc[`q${curr * 100}`] = op.quantile(variable, curr);
          return acc;
        },
        {} as {[key: string]: ReturnType<typeof op.quantile>}
      );
    const quantilesObject = this.table.rollup(rollups).objects()[0] as {[q: string]: number};
    const quantilesList = Object.values(quantilesObject)
      .sort((a, b) => a - b)
      .slice(1, -1);
    return {
      quantilesObject,
      quantilesList,
    };
  }

  paintDemography({
    variable,
    mapRef,
    ids,
  }: {
    variable: PossibleColumnsOfSummaryStatConfig[number];
    mapRef: maplibregl.Map;
    ids?: string[];
  }) {
    if (!this.table || !this.colorScale) return;
    const colorScale = this.colorScale!;
    let rows = this.table.select('path', 'sourceLayer', variable);
    if (ids) {
      rows = rows.filter(escape((row: TableRow) => ids.includes(row.path)));
    }
    (rows.objects() as TableRow[]).forEach(row => {
      const id = row.path;
      const value = row[variable as keyof typeof row];
      if (!id || isNaN(+value)) return;
      const color = colorScale(+value);

      mapRef.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          sourceLayer: row.sourceLayer,
          id,
        },
        {
          color,
          hasColor: true,
        }
      );
    });
  }

  /**
   * Generates a color scale for demographic data and applies it to the map.
   *
   * @param {Object} params - The parameters for generating the color scale.
   * @param {AllDemographyVariables} params.variable - The demographic variable to visualize.
   * @param {maplibregl.Map} params.mapRef - The reference to the map instance.
   * @param {MapStore['mapDocument']} params.mapDocument - The map document from the store.
   * @param {number} params.numberOfBins - The number of bins for the color scale.
   * @param {boolean} params.paintMap - Whether to paint the map with the generated color scale.
   *
   * @returns {d3.ScaleThreshold<number, string> | undefined} The generated color scale or undefined if prerequisites are not met.
   */
  calculateDemographyColorScale({
    variable,
    mapRef,
    mapDocument,
    numberOfBins,
    paintMap,
  }: {
    variable: PossibleColumnsOfSummaryStatConfig[number];
    mapRef: maplibregl.Map;
    mapDocument: MapStore['mapDocument'];
    numberOfBins: number;
    paintMap?: boolean;
  }) {
    if (!this.table) return;
    const quantiles = this.calculateQuantiles(variable, numberOfBins);
    const dataSoureExists = mapRef.getSource(BLOCK_SOURCE_ID);
    if (!mapRef || !mapDocument || !dataSoureExists || !quantiles) return;
    const mapMode = useMapStore.getState().mapOptions.showDemographicMap;
    const defaultColor =
      mapMode === 'side-by-side' ? DEFAULT_COLOR_SCHEME : DEFAULT_COLOR_SCHEME_GRAY;
    const uniqueQuantiles = Array.from(new Set(quantiles.quantilesList));
    const actualBinsLength = Math.min(numberOfBins, uniqueQuantiles.length + 1);
    let colorscheme = defaultColor[Math.max(3, actualBinsLength)];
    if (actualBinsLength < 3) {
      colorscheme = colorscheme.slice(0, actualBinsLength);
    }
    this.colorScale = scale
      .scaleThreshold<number, string>()
      .domain(uniqueQuantiles)
      .range(colorscheme);
    if (paintMap) {
      this.paintDemography({
        variable,
        mapRef,
      });
    }
    return this.colorScale;
  }

  /**
   * Updates the populations based on zone assignments.
   *
   * @param zoneAssignments - The zone assignments to use for updating populations.
   */
  updatePopulations(zoneAssignments?: MapStore['zoneAssignments']) {
    const populations = this.calculatePopulations(zoneAssignments);
    if (populations.ok) {
      useChartStore.getState().setDataUpdateHash(`${performance.now()}`);
      return true;
    } else {
      return false;
    }
    // .max .range
  }
}

// global demography cache
export const demographyCache = new DemographyCache();
