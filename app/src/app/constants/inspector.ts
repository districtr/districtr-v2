import {type SummaryType} from '@constants/types';

export const INSPECTOR_TITLE: Record<SummaryType, string> = {
  VAP: 'Voting Age Population',
  TOTPOP: 'Total Population',
  VOTERHISTORY: 'Voter History',
} as const;
