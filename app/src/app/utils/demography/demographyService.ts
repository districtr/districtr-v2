'use client';
import {op, table, escape} from 'arquero';
import type {ColumnTable} from 'arquero';
import {FALLBACK_NUM_DISTRICTS} from '../../constants/map/layerStyle';
import {FALLBACK_NUM_COMMUNITIES} from '../../constants/map/mapDefaults';
import {BLOCK_SOURCE_ID} from '../../constants/map/layerIds';
import {MapGeoJSONFeature} from 'maplibre-gl';
import {MapStore, useMapStore} from '../../store/mapStore';
import {useAssignmentsStore, ZoneAssignmentsMap} from '../../store/assignmentsStore';
import {useCoiAssignmentsStore} from '../../store/coiAssignmentsStore';
import {useChartStore} from '../../store/chartStore';
import {useMapControlsStore} from '../../store/mapControlsStore';
import {
  DemographyRow,
  MaxValues,
  AllTabularColumns,
  SummaryRecord,
  summaryStatsConfig,
  summaryStatsWithPctConfig,
  SummaryTable,
  TableRow,
  TabularDataWithPercent,
  AllMapConfigs,
  possibleRollups,
} from '../api/summaryStats';
import {getColumnDerives, getPctDerives, getRollups} from './arquero';
import * as scale from 'd3-scale';
import {type AnyD3Scale} from '@/app/store/demography/types';
import {
  choroplethMapVariables,
  DEFAULT_COLOR_SCHEME,
  DEFAULT_COLOR_SCHEME_GRAY,
} from '@/app/store/demography/constants';
import {NullableZone} from '@/app/constants/types';
import {ColumnarTableData} from '../ParquetWorker/parquetWorker.types';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {evalColumnConfigs} from '@/app/store/demography/evaluationConfig';
import {
  CoalitionGroupKey,
  CoalitionUniverse,
  COALITION_TOTAL_COLUMN_BY_UNIVERSE,
  COALITION_VARIABLE_BY_UNIVERSE,
  DemographyVariable,
  getAvailableCoalitionGroups,
  getMissingCoalitionGroups,
  getSelectedCoalitionColumns,
  isCoalitionVariable,
} from './coalition';
import {compareCoiZonesByRenderOrder, sortCommunitiesByRenderOrder} from '../communities';

type MapVariableConfig = {
  value: string;
  expression?: (row: any) => number; // eslint-disable-line @typescript-eslint/no-explicit-any -- accepts DemographyRow or Record<string, number>
  fixedScale?: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- visx AnyD3Scale is broader than our local AnyD3Scale
  variants?: Array<'percent' | 'raw'>;
  customLegendLabels?: string[];
};

const asNumericRecord = (row: SummaryRecord | Record<string, unknown>): Record<string, number> =>
  row as unknown as Record<string, number>;

type PopulationAssignmentRow = {
  path: string;
  zone: NullableZone;
};

type PopulationAssignments = ZoneAssignmentsMap | PopulationAssignmentRow[];

const getActivePopulationAssignments = (): PopulationAssignments => {
  const mapMode = useMapControlsStore.getState().mapMode;
  if (mapMode !== 'coi') {
    return new Map(useAssignmentsStore.getState().zoneAssignments);
  }

  const communityAssignments = useCoiAssignmentsStore.getState().communityAssignments;
  const assignmentRows: PopulationAssignmentRow[] = [];
  communityAssignments.forEach((geoids, communityId) => {
    geoids.forEach(geoid => {
      assignmentRows.push({path: geoid, zone: communityId});
    });
  });
  return assignmentRows;
};
/**
 * Class to organize queries on current demographic data
 */
class DemographyService {
  /**
   * Arquero main data table.
   * Reflects the stats pulled from the api/document/{doc id}/demography endpoint
   */
  table?: ColumnTable;

  /**
   * Separate table for choropleth overlay data (VTD-level).
   * Used so that loading VTD data for the overlay doesn't overwrite
   * zone-level populations used by the sidebar.
   */
  overlayTable?: ColumnTable;
  overlayHash: string = '';

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

  availableColumns: AllTabularColumns[number][] = [];

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
    maxValues?: MaxValues & Record<string, number>;
    maxPopulation?: number;
    minPopulation?: number;
    range?: number;
    paintedZones?: number;
  } = {};

  /**
   * Universe-wide totals (full geography rollup) for COI mode comparison.
   */
  universeTotals: SummaryRecord | null = null;

  colorScale?: AnyD3Scale;
  /**
   * Updates the cache with freshly loaded demographic columns/results.
   *
   * @param columns - Available column names included in `data`.
   * @param data - Columnar demographic rows keyed by column name.
   * @param hash - Cache key for this data snapshot (document + shatter context).
   */
  update(
    columns: AllTabularColumns[number][],
    data: ColumnarTableData,
    hash: string,
    coalitionGroups: CoalitionGroupKey[] = [],
    _zoneAssignments?: ZoneAssignmentsMap
  ): void {
    if (hash === this.hash) return;
    this.availableColumns = columns;
    this.table = table(data).derive(getColumnDerives(columns)).dedupe('path');
    const populationAssignments = _zoneAssignments ?? getActivePopulationAssignments();
    const popsOk = this.updatePopulations({
      zoneAssignments: populationAssignments,
      coalitionGroups,
    });
    if (!popsOk) return;
    this.updateSummaryStats();
    this.hash = hash;
  }

  /**
   * Loads VTD-level data for the choropleth overlay without touching
   * the main table, populations, or summary stats.
   */
  updateOverlay(columns: AllTabularColumns[number][], data: ColumnarTableData, hash: string): void {
    if (hash === this.overlayHash) return;
    this.overlayTable = table(data)
      .derive(getColumnDerives(columns))
      .dedupe('path')
      .derive(getPctDerives(columns));
    this.overlayHash = hash;
  }

  /**
   * Updates the zone table with new zone assignments.
   *
   * @param zoneAssignments - The zone assignments to update.
   */
  updateZoneTable(zoneAssignments: PopulationAssignments): void {
    const assignmentRows =
      zoneAssignments instanceof Map
        ? Array.from(zoneAssignments.entries()).map(([path, zone]) => ({path, zone}))
        : zoneAssignments;
    const normalizedAssignmentRows = assignmentRows.filter(
      ({path, zone}) => Boolean(path) && zone !== undefined && zone !== null
    );
    const rows = normalizedAssignmentRows.length;
    const zoneColumns = {
      path: new Array(rows),
      zone: new Array(rows),
    };
    normalizedAssignmentRows.forEach(({path, zone}, i) => {
      zoneColumns.path[i] = path;
      zoneColumns.zone[i] = zone;
    });
    this.zoneTable = table(zoneColumns);
  }

  /**
   * Clears the cache.
   */
  clear(): void {
    this.table = undefined;
    this.overlayTable = undefined;
    this.overlayHash = '';
    this.zoneTable = undefined;
    this.populations = [];
    this.summaryStats = {};
    this.universeTotals = null;
    this.hash = '';
    this.colorScale = undefined;
    this.zoneStats = {};
  }

  private getCoalitionColumns(
    coalitionGroups: CoalitionGroupKey[],
    universe: CoalitionUniverse
  ): Array<AllTabularColumns[number]> {
    return getSelectedCoalitionColumns({
      selectedGroups: coalitionGroups,
      availableColumns: this.availableColumns,
      universe,
    });
  }

  private applyCoalitionColumns(rows: SummaryTable, coalitionGroups: CoalitionGroupKey[]) {
    const coalitionColumnsByUniverse: Record<
      CoalitionUniverse,
      Array<AllTabularColumns[number]>
    > = {
      TOTPOP: this.getCoalitionColumns(coalitionGroups, 'TOTPOP'),
      VAP: this.getCoalitionColumns(coalitionGroups, 'VAP'),
    };
    rows.forEach(row => {
      const record = asNumericRecord(row);
      (['TOTPOP', 'VAP'] as CoalitionUniverse[]).forEach(universe => {
        const coalitionVariable = COALITION_VARIABLE_BY_UNIVERSE[universe];
        const totalColumn = COALITION_TOTAL_COLUMN_BY_UNIVERSE[universe];
        const coalitionCount = coalitionColumnsByUniverse[universe].reduce((sum, column) => {
          const value = record[column];
          return sum + (Number.isFinite(value) ? value : 0);
        }, 0);
        const totalValue = record[totalColumn];
        record[coalitionVariable] = coalitionCount;
        record[`${coalitionVariable}_pct`] =
          Number.isFinite(totalValue) && totalValue > 0 ? coalitionCount / totalValue : NaN;
      });
    });
  }

  private updateCoalitionMaxValues(rows: SummaryTable) {
    const maxValues = {...(this.zoneStats.maxValues ?? {})} as Record<string, number>;
    (['TOTPOP', 'VAP'] as CoalitionUniverse[]).forEach(universe => {
      const variable = COALITION_VARIABLE_BY_UNIVERSE[universe];
      const pctVariable = `${variable}_pct`;
      const rawMax = Math.max(0, ...rows.map(row => asNumericRecord(row)[variable] ?? 0));
      const pctMax = Math.max(
        0,
        ...rows
          .map(row => asNumericRecord(row)[pctVariable])
          .filter(value => Number.isFinite(value))
      );
      maxValues[variable] = rawMax;
      maxValues[pctVariable] = pctMax;
    });
    this.zoneStats.maxValues = maxValues as MaxValues & Record<string, number>;
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
    zoneAssignments?: PopulationAssignments,
    coalitionGroups: CoalitionGroupKey[] = []
  ): {ok: true; table: SummaryTable} | {ok: false} {
    const mapState = useMapStore.getState();
    const mapMode = useMapControlsStore.getState().mapMode;
    const zoneIds =
      mapMode === 'coi'
        ? sortCommunitiesByRenderOrder(mapState.communities).map(community => community.id)
        : Array.from(
            {length: mapState.mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS},
            (_, i) => i + 1
          );
    this.updateZoneTable(zoneAssignments ?? getActivePopulationAssignments());

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
      this.zoneStats.maxValues = maxRollups as MaxValues & Record<string, number>;
    }
    const zonePopulationsTable = populationsTable.objects() as SummaryTable;
    const populatedZoneIds = new Set(
      zonePopulationsTable
        .map(row => row.zone)
        .filter((zone): zone is number => zone !== undefined && zone !== null)
    );
    for (const zoneId of zoneIds) {
      if (!populatedZoneIds.has(zoneId)) {
        // @ts-ignore
        zonePopulationsTable.push({zone: zoneId, total_pop_20: 0});
      }
    }
    this.applyCoalitionColumns(zonePopulationsTable, coalitionGroups);
    this.updateCoalitionMaxValues(zonePopulationsTable);
    this.populations = zonePopulationsTable.sort((left, right) => {
      if (left.zone === undefined || left.zone === null) return 1;
      if (right.zone === undefined || right.zone === null) return -1;
      if (mapMode === 'coi') {
        return compareCoiZonesByRenderOrder(left.zone, right.zone, mapState.communities);
      }
      return left.zone - right.zone;
    });
    const popNumbers = this.populations
      .filter(row => row.zone !== undefined && row.zone !== null)
      .map(row => row.total_pop_20);
    this.zoneStats.maxPopulation = Math.max(...popNumbers);
    this.zoneStats.minPopulation = Math.min(...popNumbers);
    this.zoneStats.range = this.zoneStats.maxPopulation - this.zoneStats.minPopulation;
    this.summaryStats.unassigned = this.populations.find(f => !f.zone)?.total_pop_20 ?? 0;
    this.zoneStats.paintedZones = popNumbers.filter(pop => pop > 0).length;
    return {
      ok: true,
      table: this.populations,
    };
  }

  /**
   * Calculates the summary statistics.
   */
  updateSummaryStats(): void {
    if (!this.table) return;
    const columns = this.table.columnNames();
    this.table = this.table.derive(getPctDerives(columns));
    const summaries = this.table.rollup(getRollups(columns, 'sum')).objects()[0] as SummaryRecord;
    const mapState = useMapStore.getState();
    const mapDocument = mapState.mapDocument;
    const mapMode = useMapControlsStore.getState().mapMode;
    const numZones =
      mapMode === 'coi'
        ? Math.max(mapState.communities.length, FALLBACK_NUM_COMMUNITIES)
        : (mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS);

    Object.entries(summaryStatsConfig).forEach(([key, config]) => {
      const summaryStats: Partial<DemographyRow> = {};
      config['columns'].forEach(col => (summaryStats[col] = summaries[col]));
      // @ts-ignore
      this.summaryStats[key] = summaryStats as SummaryRecord;
    });

    this.summaryStats.totalPopulation = summaries.total_pop_20;
    this.summaryStats.idealpop = Math.round(summaries.total_pop_20 / numZones);

    const universeRow: Record<string, unknown> = {...summaries, zone: 0};
    possibleRollups.forEach(rollup => {
      const totalVal = summaries[rollup.total as keyof typeof summaries];
      const colVal = summaries[rollup.col as keyof typeof summaries];
      if (typeof totalVal === 'number' && totalVal !== 0 && typeof colVal === 'number') {
        universeRow[rollup.col + '_pct'] = colVal / totalVal;
      }
    });
    this.universeTotals = universeRow as SummaryRecord;
    useChartStore.getState().setDataUpdateHash(`${performance.now()}`);
  }

  calculateSummaryStats(ids: string[], _columns?: string[]): Array<Record<string, number>> {
    if (!this.table) return [];
    const columns = this.table.columnNames().filter(f => !_columns || _columns.includes(f));
    const rows = this.table
      .params({
        _hoverIds: ids,
      }) // @ts-expect-error
      .filter((d, $) => op.includes($._hoverIds, d.path))
      .rollup(getRollups(columns, 'sum'))
      .derive(getPctDerives(columns));
    return rows.objects();
  }

  /**
   * Helper to manage the arquero quantile function.
   *
   * Uses `overlayTable` (VTD-level choropleth data) when available,
   * falling back to `table` (zone-level data) for editor mode where
   * overlayTable is never populated.
   */
  calculateQuantiles(
    config: MapVariableConfig,
    variableName: string,
    numberOfBins: number
  ): {quantilesObject: {[q: string]: number}; quantilesList: number[]} | null {
    const dataTable = this.overlayTable ?? this.table;
    if (!dataTable) return null;
    const derives = {
      quantileVariable: config.expression
        ? escape(config.expression)
        : escape((row: Record<string, number>) => row[variableName]),
    };
    const rollups = new Array(numberOfBins + 1)
      .fill(0)
      .map((f, i) => (i === 0 ? i : Math.round((1 / numberOfBins) * i * 100) / 100))
      .reduce(
        (acc, curr, i) => {
          acc[`q${curr * 100}`] = op.quantile('quantileVariable', curr);
          return acc;
        },
        {} as {[key: string]: ReturnType<typeof op.quantile>}
      );
    const quantilesObject = dataTable.derive(derives).rollup(rollups).objects()[0] as {
      [q: string]: number;
    };
    const quantilesList = Object.values(quantilesObject)
      .sort((a, b) => a - b)
      .slice(1, -1);
    return {
      quantilesObject,
      quantilesList,
    };
  }

  paintDemography({
    config,
    variableName,
    mapRef,
    ids,
  }: {
    config: MapVariableConfig;
    variableName: string;
    mapRef: maplibregl.Map;
    ids?: string[];
  }) {
    // Use overlayTable (VTD-level) when available; fall back to table (zone-level).
    const dataTable = this.overlayTable ?? this.table;
    if (!dataTable || !this.colorScale) return;
    const source = mapRef.getSource(BLOCK_SOURCE_ID) as {type?: string} | undefined;
    const useVectorSourceLayer = source?.type === 'vector';
    const colorScale = this.colorScale!;

    if (!useVectorSourceLayer) {
      this.populations.forEach(row => {
        const zone = row.zone;
        if (!zone) return;
        const zoneId = String(zone);
        if (ids && !ids.includes(zoneId)) return;
        const value = config.expression
          ? config.expression(row as unknown as DemographyRow)
          : (row[variableName as keyof typeof row] as number | undefined);
        let color = '#CCCCCC';
        if (value !== undefined && !isNaN(+value)) {
          color = colorScale(+value);
        }
        mapRef.setFeatureState(
          {
            source: BLOCK_SOURCE_ID,
            id: zoneId,
          },
          {
            color,
            hasColor: true,
          }
        );
      });
      return;
    }

    const derives = {
      color: config.expression
        ? escape(config.expression)
        : escape((row: Record<string, number>) => row[variableName]),
    };
    let rows = dataTable.derive(derives).select('path', 'sourceLayer', 'color');
    if (ids) {
      rows = rows.filter(escape((row: TableRow) => ids.includes(row.path)));
    }
    (rows.objects() as Array<TableRow & {color: number}>).forEach(row => {
      const id = row.path;
      if (!id) return;
      const value = row['color'];
      let color = '#CCCCCC';
      if (!isNaN(+value)) {
        color = colorScale(+value);
      }
      mapRef.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          sourceLayer: useVectorSourceLayer ? row.sourceLayer : undefined,
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
    variant,
    mapRef,
    mapDocument,
    numberOfBins,
    paintMap,
    coalitionGroups = [],
  }: {
    variable: DemographyVariable;
    variant: 'percent' | 'raw';
    mapRef: maplibregl.Map;
    mapDocument: MapStore['mapDocument'];
    numberOfBins: number;
    paintMap?: boolean;
    coalitionGroups?: CoalitionGroupKey[];
  }) {
    const dataSoureExists = mapRef?.getSource(BLOCK_SOURCE_ID);
    let config: MapVariableConfig | undefined = Object.values(choroplethMapVariables)
      .flat()
      .find(v => v.value === variable);

    if ((!this.table && !this.overlayTable) || !dataSoureExists) return;
    if (!config && isCoalitionVariable(variable)) {
      const universe = variable === 'coalition_totpop' ? 'TOTPOP' : 'VAP';
      const totalColumn = COALITION_TOTAL_COLUMN_BY_UNIVERSE[universe];
      const coalitionColumns = this.getCoalitionColumns(coalitionGroups, universe);
      if (!coalitionColumns.length) return;
      config = {
        value: variable,
        variants: ['percent', 'raw'],
        expression: (row: Record<string, number>) => {
          const coalitionTotal = coalitionColumns.reduce((sum, column) => {
            const value = row[column];
            return sum + (Number.isFinite(value) ? value : 0);
          }, 0);
          if (variant === 'raw') return coalitionTotal;
          const total = row[totalColumn];
          return Number.isFinite(total) && total > 0 ? coalitionTotal / total : NaN;
        },
      };
    }
    if (!config) return;
    const variableName = (
      variant === 'percent' && config.variants?.includes('percent')
        ? `${config.value}_pct`
        : config.value
    ) as string;
    if (config.fixedScale) {
      this.colorScale = config.fixedScale as AnyD3Scale;
    } else {
      const quantiles = this.calculateQuantiles(config, variableName, numberOfBins);
      if (!quantiles) return;
      const uniqueQuantiles = Array.from(new Set(quantiles.quantilesList));
      const actualBinsLength = Math.min(numberOfBins, uniqueQuantiles.length + 1);

      const mapMode = useMapControlsStore.getState().mapOptions.showDemographicMap;
      const defaultColor =
        mapMode === 'side-by-side' ? DEFAULT_COLOR_SCHEME : DEFAULT_COLOR_SCHEME_GRAY;
      let colorscheme = defaultColor[Math.max(3, actualBinsLength)];

      if (actualBinsLength < 3) {
        colorscheme = colorscheme.slice(0, actualBinsLength);
      }
      this.colorScale = scale
        .scaleThreshold<number, string>()
        .domain(uniqueQuantiles)
        .range(colorscheme);
    }
    if (paintMap) {
      this.paintDemography({
        config,
        variableName,
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
  updatePopulations(
    {
      zoneAssignments,
      coalitionGroups,
    }: {
      zoneAssignments?: PopulationAssignments;
      coalitionGroups: CoalitionGroupKey[];
    } = {
      coalitionGroups: [],
    }
  ) {
    const populations = this.calculatePopulations(zoneAssignments, coalitionGroups);
    if (populations.ok) {
      useChartStore.getState().setDataUpdateHash(`${performance.now()}`);
      return true;
    } else {
      return false;
    }
    // .max .range
  }

  getCoalitionUniverseStats(summaryType: CoalitionUniverse, coalitionGroups: CoalitionGroupKey[]) {
    const summaryStats = this.summaryStats[summaryType] as Record<string, number> | undefined;
    if (!summaryStats) {
      return {
        universeTotal: 0,
        coalitionTotal: 0,
        coalitionPct: NaN,
        availableGroups: [] as CoalitionGroupKey[],
        missingGroups: [] as CoalitionGroupKey[],
      };
    }
    const totalColumn = COALITION_TOTAL_COLUMN_BY_UNIVERSE[summaryType];
    const selectedColumns = this.getCoalitionColumns(coalitionGroups, summaryType);
    const universeTotal = summaryStats[totalColumn] ?? 0;
    const coalitionTotal = selectedColumns.reduce((sum, column) => {
      const value = summaryStats[column];
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
    return {
      universeTotal,
      coalitionTotal,
      coalitionPct: universeTotal > 0 ? coalitionTotal / universeTotal : NaN,
      availableGroups: getAvailableCoalitionGroups(this.availableColumns, summaryType),
      missingGroups: getMissingCoalitionGroups(coalitionGroups, this.availableColumns, summaryType),
    };
  }
}

// global demography cache
export const demographyService = new DemographyService();
