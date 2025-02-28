'use client';
import {op} from 'arquero';
import {
  P1TotPopSummaryStats,
  P4VapPopSummaryStats,
  SummaryStatKeys,
  SummaryTypes,
} from '../api/summaryStats';
import {DemographyRow, MaxRollups} from './types';

const NaNfN = (_row: DemographyRow) => NaN;
export const getRollups = (stats: Record<keyof SummaryTypes, boolean>) => {
  const rollups: Partial<P1TotPopSummaryStats & P4VapPopSummaryStats> = {};
  Object.keys(stats).forEach(stat => {
    if (stat in SummaryStatKeys) {
      const keys = SummaryStatKeys[stat as keyof SummaryTypes];
      keys.forEach(key => {
        rollups[key] = op.sum(key);
      });
    }
  });
  return rollups;
};

export const getPctDerives = (
  stats: Record<keyof SummaryTypes, boolean>
): Record<string, (row: DemographyRow) => number> => ({
  other_pop_pct: !stats.P1 ? NaNfN : row => row['other_pop'] / row['total_pop'],
  asian_pop_pct: !stats.P1 ? NaNfN : row => row['asian_pop'] / row['total_pop'],
  amin_pop_pct: !stats.P1 ? NaNfN : row => row['amin_pop'] / row['total_pop'],
  nhpi_pop_pct: !stats.P1 ? NaNfN : row => row['nhpi_pop'] / row['total_pop'],
  black_pop_pct: !stats.P1 ? NaNfN : row => row['black_pop'] / row['total_pop'],
  white_pop_pct: !stats.P1 ? NaNfN : row => row['white_pop'] / row['total_pop'],
  two_or_more_races_pop_pct: !stats.P1
    ? NaNfN
    : row => row['two_or_more_races_pop'] / row['total_pop'],
  hispanic_vap_pct: !stats.P4 ? NaNfN : row => row['hispanic_vap'] / row['total_vap'],
  non_hispanic_asian_vap_pct: !stats.P4
    ? NaNfN
    : row => row['non_hispanic_asian_vap'] / row['total_vap'],
  non_hispanic_amin_vap_pct: !stats.P4
    ? NaNfN
    : row => row['non_hispanic_amin_vap'] / row['total_vap'],
  non_hispanic_nhpi_vap_pct: !stats.P4
    ? NaNfN
    : row => row['non_hispanic_nhpi_vap'] / row['total_vap'],
  non_hispanic_black_vap_pct: !stats.P4
    ? NaNfN
    : row => row['non_hispanic_black_vap'] / row['total_vap'],
  non_hispanic_white_vap_pct: !stats.P4
    ? NaNfN
    : row => row['non_hispanic_white_vap'] / row['total_vap'],
  non_hispanic_other_vap_pct: !stats.P4
    ? NaNfN
    : row => row['non_hispanic_other_vap'] / row['total_vap'],
  non_hispanic_two_or_more_races_vap_pct: !stats.P4
    ? NaNfN
    : row => row['non_hispanic_two_or_more_races_vap'] / row['total_vap'],
});

export const getMaxRollups = (stats: Record<keyof SummaryTypes, boolean>) => {
  const rollups: Partial<MaxRollups> = {};
  Object.keys(stats).forEach(stat => {
    if (stat in SummaryStatKeys) {
      const keys = SummaryStatKeys[stat as keyof SummaryTypes];
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

const z = op.max('zone');
