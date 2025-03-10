export type SummaryTypes = 'TOTPOP' | 'VAP';

/**
 * TOTPOPZoneSummaryStats
 *
 * @interface
 * @property {number} zone - The zone.
 * @property {number} total_pop - The total population.
 */
export interface TOTPOPZoneSummaryStats {
  other_pop_20: number;
  asian_pop_20: number;
  amin_pop_20: number;
  nhpi_pop_20: number;
  black_pop_20: number;
  white_pop_20: number;
  two_or_more_races_pop_20: number;
  total_pop_20: number;
}

export type TOTPOPTotPopSummaryStats = Omit<TOTPOPZoneSummaryStats, 'zone'>;

export const TOTPOPZoneSummaryStatsKeys: Array<keyof TOTPOPZoneSummaryStats> = [
  'other_pop_20',
  'asian_pop_20',
  'amin_pop_20',
  'nhpi_pop_20',
  'black_pop_20',
  'white_pop_20',
  'two_or_more_races_pop_20_x',
] as const;

export type CleanedTOTPOPZoneSummaryStats = WithPercentColumns<
  TOTPOPZoneSummaryStats,
  Exclude<(typeof TOTPOPZoneSummaryStatsKeys)[number], 'total_pop'>
>;

export interface VAPZoneSummaryStats {
  white_vap_20: number;
  other_vap_20: number;
  amin_vap_20: number;
  asian_nhpi_vap_20: number;
  hvap_20: number;
  bvap_20: number;
  total_vap_20: number;
}

export type VAPVapPopSummaryStats = Omit<VAPZoneSummaryStats, 'zone'>;

export const VAPZoneSummaryStatsKeys: Array<keyof VAPZoneSummaryStats> = [
  'white_vap_20',
  'other_vap_20',
  'amin_vap_20',
  'asian_nhpi_vap_20',
  'hvap_20',
  'bvap_20',
] as const;

/**
 * VAPZoneSummaryStats
 *
 * @interface
 * @property {number} zone - The zone.
 * @property {number} total_pop - The total population.
 */

export type CleanedVAPZoneSummaryStats = WithPercentColumns<
  VAPZoneSummaryStats,
  Exclude<(typeof VAPZoneSummaryStatsKeys)[number], 'total_vap_20'>
>;

export const SummaryStatKeys = {
  TOTPOP: TOTPOPZoneSummaryStatsKeys,
  VAP: VAPZoneSummaryStatsKeys,
} as const;

export const TotalColumnKeys = {
  TOTPOP: 'total_pop_20',
  VAP: 'total_vap_20',
} as const;

export type TotalColumnVariables = (typeof TotalColumnKeys)[keyof typeof TotalColumnKeys];

export type DemographyVariable =
  | typeof TOTPOPZoneSummaryStatsKeys
  | typeof VAPZoneSummaryStatsKeys
  | TotalColumnVariables;
  
export type AllDemographyVariables =
  | keyof CleanedTOTPOPZoneSummaryStats
  | keyof CleanedVAPZoneSummaryStats
  | TotalColumnVariables;

// GENERICS
export type WithPercentColumns<
  TBase extends Record<string, any>,
  TPercentCols extends string,
> = TBase & {
  [K in TPercentCols as `${K}_pct`]: number;
};

export interface SummaryStatsResult<T extends object> {
  summary_stat: string;
  results: T;
}
