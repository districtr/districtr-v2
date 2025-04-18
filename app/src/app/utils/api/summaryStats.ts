export const summaryStatsConfig = {
  TOTPOP: {
    possibleColumns: [
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
    possibleColumns: [
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
    possibleColumns: [
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
  },
} as const;

/**
 * Adds a _pct suffix to all possibleColumns and returns a new config with the same keys
 * Also includes the original columns without the _pct suffix
 * @param config - The config to add the _pct suffix to
 * @returns A new config with both original columns and columns with _pct suffix
 */
const withPct = <T extends typeof summaryStatsConfig>(
  config: T
): {
  [K in keyof T]: {
    possibleColumns: Array<
      | Extract<T[K], {possibleColumns: readonly string[]}>['possibleColumns'][number]
      | `${Extract<T[K], {possibleColumns: readonly string[]}>['possibleColumns'][number]}_pct`
    >;
    sumColumn?: Extract<T[K], {sumColumn?: string}>['sumColumn'];
  };
} => {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      {
        ...value,
        possibleColumns: [
          ...value.possibleColumns,
          ...value.possibleColumns.map(col => `${col}_pct`),
        ],
      },
    ])
  ) as any;
};

export const summaryStatsWithPctConfig = withPct(summaryStatsConfig);
export const possibleRollups = Object.values(summaryStatsConfig).filter(stat => 'sumColumn' in stat).flatMap(stat =>
  stat.possibleColumns.map(col => ({
    // @ts-ignore
    total: stat.sumColumn,
    col,
  }))
);

// DERIVED TYPES
export type SummaryStatConfig = typeof summaryStatsConfig;
export type KeyOfSummaryStatConfig = keyof SummaryStatConfig;
export type AllTabularColumns =
  SummaryStatConfig[KeyOfSummaryStatConfig]['possibleColumns'];
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
 * A shape of data including the columns in possibleColumns with a _pct suffix
 */
export type TabularDataWithPercent<T extends SummaryStatConfig[keyof SummaryStatConfig]> = {
  [K in T['possibleColumns'][number] as `${K}_pct`]: number;
} & {
  [K in T['possibleColumns'][number]]: number;
};
