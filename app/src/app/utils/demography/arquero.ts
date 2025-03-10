'use client';
import {op} from 'arquero';
import {
  TOTPOPTotPopSummaryStats,
  VAPVapPopSummaryStats,
  SummaryStatKeys,
  SummaryTypes,
} from '../api/summaryStats';
import {DemographyRow, MaxRollups} from './types';

const NaNfN = (_row: DemographyRow) => NaN;

/**
 * Generates a record of functions that calculate the percentage of various demographic populations.
 * Each function takes a `DemographyRow` object and returns a number representing the percentage
 * of a specific population group relative to the total population or total voting age population.
 * This is required for the way Arquero handles deriving columns and is somewhat fussy.
 * 
 * @param stats - An object containing boolean flags indicating the availability of certain demographic data.
 * 
 * @returns A record where keys are demographic percentage identifiers and values are functions
 *          that calculate the respective percentages.
 * 
 * If the corresponding data is not available (as indicated by the `stats` parameter), the function will return `NaN`.
 */
export const getPctDerives = (
  stats: Record<SummaryTypes, boolean>
): Record<string, (row: DemographyRow) => number> => ({
  other_pop_pct: !stats.TOTPOP ? NaNfN : row => row['other_pop'] / row['total_pop'],
  asian_pop_pct: !stats.TOTPOP ? NaNfN : row => row['asian_pop'] / row['total_pop'],
  amin_pop_pct: !stats.TOTPOP ? NaNfN : row => row['amin_pop'] / row['total_pop'],
  nhpi_pop_pct: !stats.TOTPOP ? NaNfN : row => row['nhpi_pop'] / row['total_pop'],
  black_pop_pct: !stats.TOTPOP ? NaNfN : row => row['black_pop'] / row['total_pop'],
  white_pop_pct: !stats.TOTPOP ? NaNfN : row => row['white_pop'] / row['total_pop'],
  two_or_more_races_pop_pct: !stats.TOTPOP
    ? NaNfN
    : row => row['two_or_more_races_pop'] / row['total_pop'],
  hispanic_vap_pct: !stats.VAP ? NaNfN : row => row['hispanic_vap'] / row['total_vap'],
  non_hispanic_asian_vap_pct: !stats.VAP
    ? NaNfN
    : row => row['non_hispanic_asian_vap'] / row['total_vap'],
  non_hispanic_amin_vap_pct: !stats.VAP
    ? NaNfN
    : row => row['non_hispanic_amin_vap'] / row['total_vap'],
  non_hispanic_nhpi_vap_pct: !stats.VAP
    ? NaNfN
    : row => row['non_hispanic_nhpi_vap'] / row['total_vap'],
  non_hispanic_black_vap_pct: !stats.VAP
    ? NaNfN
    : row => row['non_hispanic_black_vap'] / row['total_vap'],
  non_hispanic_white_vap_pct: !stats.VAP
    ? NaNfN
    : row => row['non_hispanic_white_vap'] / row['total_vap'],
  non_hispanic_other_vap_pct: !stats.VAP
    ? NaNfN
    : row => row['non_hispanic_other_vap'] / row['total_vap'],
  non_hispanic_two_or_more_races_vap_pct: !stats.VAP
    ? NaNfN
    : row => row['non_hispanic_two_or_more_races_vap'] / row['total_vap'],
});

/**
 * Generates an object containing the summary rollup values for the given statistics.
 * Rollup functions, unlike Derives in Arquero, can be programmatically generated.
 *
 * @param stats - An object where the keys are summary statistic types and the values are booleans indicating whether to include the statistic.
 * @returns An object containing the maximum rollup values for each statistic key and their corresponding percentage keys (if applicable).
 */
export const getRollups = (stats: Record<SummaryTypes, boolean>) => {
  const rollups: Partial<TOTPOPTotPopSummaryStats & VAPVapPopSummaryStats> = {};
  Object.keys(stats).forEach(stat => {
    if (stat in SummaryStatKeys) {
      const keys = SummaryStatKeys[stat as SummaryTypes];
      keys.forEach(key => {
        rollups[key] = op.sum(key);
      });
    }
  });
  return rollups;
};

/**
 * Generates an object containing the maximum rollup values for the given statistics.
 * Rollup functions, unlike Derives in Arquero, can be programmatically generated.
 *
 * @param stats - An object where the keys are summary statistic types and the values are booleans indicating whether to include the statistic.
 * @returns An object containing the maximum rollup values for each statistic key and their corresponding percentage keys (if applicable).
 */
export const getMaxRollups = (stats: Record<SummaryTypes, boolean>) => {
  const rollups: Partial<MaxRollups> = {};
  Object.keys(stats).forEach(stat => {
    if (stat in SummaryStatKeys) {
      const keys = SummaryStatKeys[stat as SummaryTypes];
      keys.forEach(key => {
        rollups[key] = op.max(key);
        if (!key.includes('total')) {
          // @ts-ignore
          rollups[key + '_pct'] = op.max(key + '_pct');
        }
      });
    }
  });
  return rollups;
};