import {KeyOfSummaryStatConfig} from '@utils/api/summaryStats';
import {NumberFormats} from '@utils/numbers';

export const INSPECTOR_TITLE = {
  VAP: 'Voting Age Population',
  TOTPOP: 'Total Population',
  VOTERHISTORY: 'Voter History',
};

export const TOTAL_COLUMN: Record<KeyOfSummaryStatConfig, string | undefined> = {
  VAP: 'total_vap_20',
  TOTPOP: 'total_pop_20',
  VOTERHISTORY: undefined,
};
