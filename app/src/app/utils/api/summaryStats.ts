export type SummaryTypes = {
  P1: {
    raw: P1TotPopSummaryStats,
    cleaned: CleanedP1ZoneSummaryStats,
  }
  P4: {
    raw: P4VapPopSummaryStats,
    cleaned: CleanedP4ZoneSummaryStats,
  }
}


/**
 * P1ZoneSummaryStats
 *
 * @interface
 * @property {number} zone - The zone.
 * @property {number} total_pop - The total population.
 */
export interface P1ZoneSummaryStats {
  zone: number;
  other_pop: number;
  asian_pop: number;
  amin_pop: number;
  nhpi_pop: number;
  black_pop: number;
  white_pop: number;
  two_or_more_races_pop: number;
  total_pop: number;
}

export type P1TotPopSummaryStats = Omit<P1ZoneSummaryStats, 'zone'>;

export const P1ZoneSummaryStatsKeys = [
  'other_pop',
  'asian_pop',
  'amin_pop',
  'nhpi_pop',
  'black_pop',
  'white_pop',
  'two_or_more_races_pop',
  'total_pop',
] as const;

export type CleanedP1ZoneSummaryStats = WithPercentColumns<
  P1ZoneSummaryStats, 
  Exclude<typeof P1ZoneSummaryStatsKeys[number], 'total_pop'>
>;

export interface P4ZoneSummaryStats {
  zone: number;
  hispanic_vap: number;
  non_hispanic_asian_vap: number;
  non_hispanic_amin_vap: number;
  non_hispanic_nhpi_vap: number;
  non_hispanic_black_vap: number;
  non_hispanic_white_vap: number;
  non_hispanic_other_vap: number;
  non_hispanic_two_or_more_races_vap: number;
  total_vap: number;
}

export type P4VapPopSummaryStats = Omit<P4ZoneSummaryStats, 'zone'>;

export const P4ZoneSummaryStatsKeys = [
  'hispanic_vap',
  'non_hispanic_asian_vap',
  'non_hispanic_amin_vap',
  'non_hispanic_nhpi_vap',
  'non_hispanic_black_vap',
  'non_hispanic_white_vap',
  'non_hispanic_other_vap',
  'non_hispanic_two_or_more_races_vap',
  'total_vap',
] as const;

/**
 * P4ZoneSummaryStats
 *
 * @interface
 * @property {number} zone - The zone.
 * @property {number} total_pop - The total population.
 */


export type CleanedP4ZoneSummaryStats = WithPercentColumns<
  P4ZoneSummaryStats, 
  Exclude<typeof P4ZoneSummaryStatsKeys[number], 'total_vap'>
>;

export const SummaryStatKeys = {
  P1: P1ZoneSummaryStatsKeys,
  P4: P4ZoneSummaryStatsKeys,
} as const;

export const TotalColumnKeys = {
  P1: 'total_pop',
  P4: 'total_vap',
} as const;

// GENERICS
export type WithPercentColumns<
  TBase extends Record<string, any>, 
  TPercentCols extends string
> = TBase & {
  [K in TPercentCols as `${K}_pct`]: number;
}

export interface SummaryStatsResult<T extends object> {
  summary_stat: string;
  results: T
}