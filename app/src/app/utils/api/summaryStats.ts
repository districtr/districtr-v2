import {AnyD3Scale} from '@visx/scale';
import {ACS_UNIVERSES, SUMMARY_TYPES, type SummaryType} from '@constants/demography/summary';
import * as chromatic from 'd3-scale-chromatic';
export interface ColumnSet {
  /**
   * All possible columns appearing in the set
   */
  columns: readonly string[];
  /**
   * Optionally, the denominator column for the set
   */
  sumColumn?: string;
}

export type DemographyTableColumnConfiguration<T extends ColumnSet> = Array<{
  label: string;
  column: T['columns'][number];
  sourceCol?: T['columns'][number];
  /** Denominator column (e.g. total_pop_20/total_vap_20): always rendered as a raw
   *  count, never a share of itself, and never color-shaded. */
  isTotal?: boolean;
}>;

export type MapColumnConfiguration<T extends ColumnSet> = Array<{
  label: string;
  value: T['columns'][number];
  colorScheme?: typeof chromatic.schemeBlues;
  expression?: (row: DemographyRow) => number;
  fixedScale?: AnyD3Scale;
  variants?: Array<'percent' | 'raw'>;
  customLegendLabels?: Array<string>;
}>;

// Comprehensive set of political columns available in gerrydb tables.
export const ALL_VOTER_COLUMN_GROUPINGS = {
  'Presidential 2024': {columns: ['pres_24_dem', 'pres_24_rep']},
  'Presidential 2020': {columns: ['pres_20_dem', 'pres_20_rep']},
  'Presidential 2016': {columns: ['pres_16_dem', 'pres_16_rep']},
  'Presidential 2012': {columns: ['pres_12_dem', 'pres_12_rep']},
  'Presidential 2008': {columns: ['pres_08_dem', 'pres_08_rep']},
  'Senate 2024': {columns: ['sen_24_dem', 'sen_24_rep']},
  'Senate 2022': {columns: ['sen_22_dem', 'sen_22_rep']},
  'Senate 2020': {columns: ['sen_20_dem', 'sen_20_rep']},
  'Senate 2018': {columns: ['sen_18_dem', 'sen_18_rep']},
  'Senate 2016': {columns: ['sen_16_dem', 'sen_16_rep']},
  'Senate 2014': {columns: ['sen_14_dem', 'sen_14_rep']},
  'Governor 2024': {columns: ['gov_24_dem', 'gov_24_rep']},
  'Governor 2023': {columns: ['gov_23_dem', 'gov_23_rep']},
  'Governor 2022': {columns: ['gov_22_dem', 'gov_22_rep']},
  'Governor 2021': {columns: ['gov_21_dem', 'gov_21_rep']},
  'Governor 2020': {columns: ['gov_20_dem', 'gov_20_rep']},
  'Governor 2019': {columns: ['gov_19_dem', 'gov_19_rep']},
  'Governor 2018': {columns: ['gov_18_dem', 'gov_18_rep']},
  'Governor 2017': {columns: ['gov_17_dem', 'gov_17_rep']},
  'Governor 2016': {columns: ['gov_16_dem', 'gov_16_rep']},
  'Governor 2014': {columns: ['gov_14_dem', 'gov_14_rep']},
  'Attorney General 2024': {columns: ['ag_24_dem', 'ag_24_rep']},
  'Attorney General 2023': {columns: ['ag_23_dem', 'ag_23_rep']},
  'Attorney General 2022': {columns: ['ag_22_dem', 'ag_22_rep']},
  'Attorney General 2021': {columns: ['ag_21_dem', 'ag_21_rep']},
  'Attorney General 2020': {columns: ['ag_20_dem', 'ag_20_rep']},
  'Attorney General 2019': {columns: ['ag_19_dem', 'ag_19_rep']},
  'Attorney General 2018': {columns: ['ag_18_dem', 'ag_18_rep']},
  'Attorney General 2017': {columns: ['ag_17_dem', 'ag_17_rep']},
  'Attorney General 2016': {columns: ['ag_16_dem', 'ag_16_rep']},
  'Attorney General 2014': {columns: ['ag_14_dem', 'ag_14_rep']},
} as const;

export const derivedColumnsConfig = {
  [SUMMARY_TYPES.VOTERHISTORY]: Object.values(ALL_VOTER_COLUMN_GROUPINGS).reduce(
    (acc, curr) => {
      return [
        ...acc,
        {
          label: curr.columns[0].replace('_dem', '_total'),
          column: curr.columns[0],
          expression: row => row[curr.columns[0]] + row[curr.columns[1]],
        },
      ];
    },
    [] as {label: string; column: string; expression: (row: DemographyRow) => number}[]
  ),
};

export const derivedRollups = {
  // X_dem_pct / X_rep_pct are raw two-party vote shares (dem+rep denominator).
  VOTERHISTORY: Object.values(ALL_VOTER_COLUMN_GROUPINGS).reduce(
    (acc, curr) => {
      const total = curr.columns[0].replace('_dem', '_total');
      return [
        ...acc,
        {total, col: total},
        {total, col: curr.columns[0]},
        {total, col: curr.columns[1]},
      ];
    },
    [] as {total: string; col: string}[]
  ),
};

export const summaryStatsConfig = {
  TOTPOP: {
    columns: [
      'amin_pop_20',
      'asian_nhpi_pop_20',
      'bpop_20',
      'hpop_20',
      'white_pop_20',
      'other_pop_20',
      'total_pop_20',
    ],
    sumColumn: 'total_pop_20',
  },
  VAP: {
    columns: [
      'white_vap_20',
      'other_vap_20',
      'amin_vap_20',
      'asian_nhpi_vap_20',
      'hvap_20',
      'bvap_20',
      'total_vap_20',
    ],
    sumColumn: 'total_vap_20',
  },
  VOTERHISTORY: {
    // Derived from the groupings above so the two lists can't drift.
    columns: Object.values(ALL_VOTER_COLUMN_GROUPINGS).flatMap(grouping => grouping.columns),
  },
  // ACS 2020-2024 socioeconomic universes (counts + their own denominator).
  AGE: {
    columns: ['under_18_pop_24', 'over_65_pop_24', 'total_pop_24'],
    sumColumn: 'total_pop_24',
  },
  INCOME: {
    columns: [
      'hh_inc_under_35k_24',
      'hh_inc_35k_75k_24',
      'hh_inc_75k_125k_24',
      'hh_inc_125k_plus_24',
      'total_hh_24',
    ],
    sumColumn: 'total_hh_24',
  },
  EDUCATION: {
    columns: ['bachelors_plus_24', 'total_pop_25plus_24'],
    sumColumn: 'total_pop_25plus_24',
  },
  VEHICLES: {
    columns: ['hh_no_vehicle_24', 'total_occ_hh_24'],
    sumColumn: 'total_occ_hh_24',
  },
} as const satisfies {[K in SummaryType]: ColumnSet};

/** True when the column belongs to an ACS-sourced universe — drives the ACS
 * data-source citation; every other column is decennial-census or elections. */
export const isAcsColumn = (column: string): boolean =>
  ACS_UNIVERSES.some(universe =>
    (summaryStatsConfig[universe].columns as readonly string[]).includes(column)
  );

export const possibleRollups = [
  ...Object.values(summaryStatsConfig)
    .filter(stat => 'sumColumn' in stat)
    .flatMap(stat =>
      stat.columns.map(col => ({
        // @ts-ignore this is correct but on build fails
        total: stat.sumColumn,
        col,
      }))
    ),
  ...Object.values(derivedRollups).flat(),
];

export const possibleDerivedColumns = Object.values(derivedColumnsConfig).flat();

// DERIVED TYPES
export type SummaryStatConfig = typeof summaryStatsConfig;
export type AllTabularColumns = SummaryStatConfig[SummaryType]['columns'];
export type AllDemographyTableConfigs = DemographyTableColumnConfiguration<
  SummaryStatConfig[SummaryType]
>;
export type AllMapConfigs = MapColumnConfiguration<SummaryStatConfig[SummaryType]>;
export type DemographyRow = {
  [key in AllTabularColumns[number]]: number;
};
export type MaxValues = {
  [key in AllTabularColumns[number]]: number;
};
export type TableRow = DemographyRow & {path: string; sourceLayer: string};
export type SummaryRecord = TableRow & {zone: number};
export type SummaryTable = Array<SummaryRecord>;

/**
 * A shape of data including the columns in columns with a _pct suffix
 */
export type TabularDataWithPercent<T extends SummaryStatConfig[SummaryType]> = {
  [K in T['columns'][number] as `${K}_pct`]: number;
} & {
  [K in T['columns'][number]]: number;
};

/**
 * Adds a _pct suffix to all columns and returns a new config with the same keys
 * Also includes the original columns without the _pct suffix
 * @param config - The config to add the _pct suffix to
 * @returns A new config with both original columns and columns with _pct suffix
 */
const withPct = <T extends typeof summaryStatsConfig>(
  config: T
): {
  [K in keyof T]: {
    columns: Array<
      | Extract<T[K], {columns: readonly string[]}>['columns'][number]
      | `${Extract<T[K], {columns: readonly string[]}>['columns'][number]}_pct`
    >;
    sumColumn?: Extract<T[K], {sumColumn?: string}>['sumColumn'];
  };
} => {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      {
        ...value,
        columns: [...value.columns, ...value.columns.map(col => `${col}_pct`)],
      },
    ])
  ) as any;
};
export const summaryStatsWithPctConfig = withPct(summaryStatsConfig);
