import {AnyD3Scale} from '@visx/scale';
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

export type EvalColumnConfiguration<T extends ColumnSet> = Array<{
  label: string;
  column: T['columns'][number];
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

export const ALL_VOTER_COLUMN_GROUPINGS = {
  'Attorney General 2022': {
    columns: ['ag_22_dem', 'ag_22_rep'],
  },
  'Attorney General 2018': {columns: ['ag_18_dem', 'ag_18_rep']},
  'Governor 2022': {columns: ['gov_22_dem', 'gov_22_rep']},
  'Governor 2018': {columns: ['gov_18_dem', 'gov_18_rep']},
  'Senate 2022': {columns: ['sen_22_dem', 'sen_22_rep']},
  'Senate 2018': {columns: ['sen_18_dem', 'sen_18_rep']},
  'Senate 2016': {columns: ['sen_16_dem', 'sen_16_rep']},
  'Presidential 2020': {columns: ['pres_20_dem', 'pres_20_rep']},
  'Presidential 2016': {columns: ['pres_16_dem', 'pres_16_rep']},
} as const;

export const derivedColumnsConfig = {
  VOTERHISTORY: Object.values(ALL_VOTER_COLUMN_GROUPINGS).reduce((acc, curr) => {
      return [
        ...acc,
        {
          label: curr.columns[0].replace("_dem", "_lean"),
          column: curr.columns[0],
          expression: (row) => row[curr.columns[0]] - row[curr.columns[1]],
        },
        {
          label: curr.columns[0].replace("_dem", "_total"),
          column: curr.columns[0],
          expression: (row) => row[curr.columns[0]] + row[curr.columns[1]],
        },
      ];
    }, [] as {label: string; column: string; expression: (row: DemographyRow) => number}[])
}

export const derivedRollups = {
  VOTERHISTORY: Object.values(ALL_VOTER_COLUMN_GROUPINGS).reduce((acc, curr) => {
    return [
      ...acc,
      {
        total: curr.columns[0].replace("_dem", "_total"),
        col: curr.columns[0].replace("_dem", "_total"),
      },
      {
        total: curr.columns[0].replace("_dem", "_total"),
        col: curr.columns[0],
      }
    ]
  }, [] as {total: string; col: string}[])
}

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
    columns: [
      'ag_22_rep',
      'ag_22_dem',
      'ag_18_rep',
      'ag_18_dem',
      'gov_22_rep',
      'gov_22_dem',
      'gov_18_rep',
      'gov_18_dem',
      'sen_22_rep',
      'sen_22_dem',
      'sen_18_rep',
      'sen_18_dem',
      'sen_16_rep',
      'sen_16_dem',
      'pres_20_rep',
      'pres_20_dem',
      'pres_16_rep',
      'pres_16_dem',
    ]
  }
} as const;


// /**
//  * Adds a _pct suffix to all columns and returns a new config with the same keys
//  * Also includes the original columns without the _pct suffix
//  * @param config - The config to add the _pct suffix to
//  * @returns A new config with both original columns and columns with _pct suffix
//  */
// const withPct = <T extends typeof summaryStatsConfig>(
//   config: T
// ): {
//   [K in keyof T]: {
//     columns: Array<
//       | Extract<T[K], {columns: readonly string[]}>['columns'][number]
//       | `${Extract<T[K], {columns: readonly string[]}>['columns'][number]}_pct`
//     >;
//     sumColumn?: Extract<T[K], {sumColumn?: string}>['sumColumn'];
//   };
// } => {
//   return Object.fromEntries(
//     Object.entries(config).map(([key, value]) => [
//       key,
//       {
//         ...value,
//         columns: [...value.columns, ...value.columns.map(col => `${col}_pct`)],
//       },
//     ])
//   ) as any;
// };
// export const summaryStatsWithPctConfig = withPct(summaryStatsConfig);

export const possibleRollups = [
  ...Object.values(summaryStatsConfig)
    .filter(stat => 'sumColumn' in stat)
    .flatMap(stat =>
      stat.columns.map(col => ({
        total: stat.sumColumn,
        col,
      }))
    ),
  ...Object.values(derivedRollups).flat()
]

export const possibleDerivedColumns = Object.values(derivedColumnsConfig).flat()

// DERIVED TYPES
export type SummaryStatConfig = typeof summaryStatsConfig;
export type KeyOfSummaryStatConfig = keyof SummaryStatConfig;
export type AllTabularColumns = SummaryStatConfig[KeyOfSummaryStatConfig]['columns'];
export type AllEvaluationConfigs = EvalColumnConfiguration<
  SummaryStatConfig[KeyOfSummaryStatConfig]
>;
export type AllMapConfigs = MapColumnConfiguration<
  SummaryStatConfig[KeyOfSummaryStatConfig]
>;
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
export type TabularDataWithPercent<T extends SummaryStatConfig[keyof SummaryStatConfig]> = {
  [K in T['columns'][number] as `${K}_pct`]: number;
} & {
  [K in T['columns'][number]]: number;
};
