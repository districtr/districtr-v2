'use client';
import {op} from 'arquero';
import {
  TOTPOPTotPopSummaryStats,
  VAPVapPopSummaryStats,
  SummaryStatKeys,
  SummaryTypes,
  TotalColumnKeys,
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
  other_pop_20_pct: !stats.TOTPOP ? NaNfN : row => row['other_pop_20'] / row['total_pop_20'],
  asian_nhpi_pop_20_pct: !stats.TOTPOP
    ? NaNfN
    : row => row['asian_nhpi_pop_20'] / row['total_pop_20'],
  amin_pop_20_pct: !stats.TOTPOP ? NaNfN : row => row['amin_pop_20'] / row['total_pop_20'],
  bpop_20_pct: !stats.TOTPOP ? NaNfN : row => row['bpop_20'] / row['total_pop_20'],
  hpop_20_pct: !stats.TOTPOP ? NaNfN : row => row['hpop_20'] / row['total_pop_20'],
  white_pop_20_pct: !stats.TOTPOP ? NaNfN : row => row['white_pop_20'] / row['total_pop_20'],
  hvap_20_pct: !stats.VAP ? NaNfN : row => row['hvap_20'] / row['total_vap_20'],
  asian_nhpi_vap_20_pct: !stats.VAP ? NaNfN : row => row['asian_nhpi_vap_20'] / row['total_vap_20'],
  amin_vap_20_pct: !stats.VAP ? NaNfN : row => row['amin_vap_20'] / row['total_vap_20'],
  bvap_20_pct: !stats.VAP ? NaNfN : row => row['bvap_20'] / row['total_vap_20'],
  white_vap_20_pct: !stats.VAP ? NaNfN : row => row['white_vap_20'] / row['total_vap_20'],
  other_vap_20_pct: !stats.VAP ? NaNfN : row => row['other_vap_20'] / row['total_vap_20'],
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
    const totalColumn = TotalColumnKeys[stat as SummaryTypes];
    if (totalColumn) {
      rollups[totalColumn] = op.sum(totalColumn);
    }
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
