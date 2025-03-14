export type SummaryTypes = 'TOTPOP' | 'VAP';

/**
 * TOTPOPZoneSummaryStats
 *
 * @interface
 * @property {number} total_pop_20 - The total population.
 */
export interface TOTPOPZoneSummaryStats {
  white_pop_20: number;
  other_pop_20: number;
  amin_pop_20: number;
  asian_nhpi_pop_20: number;
  hpop_20: number;
  bpop_20: number;
  total_pop_20: number;
}

export type TOTPOPTotPopSummaryStats = Omit<TOTPOPZoneSummaryStats, 'zone'>;

export const TOTPOPZoneSummaryStatsKeys: Array<keyof TOTPOPZoneSummaryStats> = [
  'white_pop_20',
  'other_pop_20',
  'amin_pop_20',
  'asian_nhpi_pop_20',
  'hpop_20',
  'bpop_20',
] as const;

export type CleanedTOTPOPZoneSummaryStats = WithPercentColumns<
  TOTPOPZoneSummaryStats,
  Exclude<(typeof TOTPOPZoneSummaryStatsKeys)[number], 'total_pop_20'>
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
 * @property {number} total_vap_20 - The total population.
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
export const TotalColumnKeysArray = Object.values(TotalColumnKeys);

export type TotalColumnVariables = (typeof TotalColumnKeys)[keyof typeof TotalColumnKeys];

export type DemographyVariable =
  | (typeof TOTPOPZoneSummaryStatsKeys)[number]
  | (typeof VAPZoneSummaryStatsKeys)[number]
  | TotalColumnVariables;

export type AllDemographyVariables =
  | DemographyVariable
  | keyof CleanedTOTPOPZoneSummaryStats
  | keyof CleanedVAPZoneSummaryStats;

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
