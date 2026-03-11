import {KeyOfSummaryStatConfig, summaryStatsConfig} from '@utils/api/summaryStats';

/**
 * Column set key constants, matching the keys in summaryStatsConfig.
 */
export const COLUMN_SETS = {
  TOTPOP: 'TOTPOP',
  VAP: 'VAP',
  VOTERHISTORY: 'VOTERHISTORY',
} as const satisfies Record<string, KeyOfSummaryStatConfig>;

/**
 * The total/denominator column for each column set.
 * Derived from summaryStatsConfig sumColumn where available.
 */
export const TOTAL_COLUMNS: Record<KeyOfSummaryStatConfig, string | undefined> = {
  [COLUMN_SETS.TOTPOP]: summaryStatsConfig.TOTPOP.sumColumn,
  [COLUMN_SETS.VAP]: summaryStatsConfig.VAP.sumColumn,
  [COLUMN_SETS.VOTERHISTORY]: undefined,
};

/**
 * Human-readable labels for each column set.
 */
export const COLUMN_SET_LABELS: Record<KeyOfSummaryStatConfig, string> = {
  [COLUMN_SETS.VAP]: 'Voting Age Population',
  [COLUMN_SETS.TOTPOP]: 'Total Population',
  [COLUMN_SETS.VOTERHISTORY]: 'Voter History',
};
