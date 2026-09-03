import {type SummaryType} from '@constants/demography/summary';

export const INSPECTOR_TITLE: Record<SummaryType, string> = {
  VAP: 'Voting Age Population',
  TOTPOP: 'Total Population',
  VOTERHISTORY: 'Voter History',
  AGE: 'Age (ACS)',
  INCOME: 'Household Income (ACS)',
  EDUCATION: 'Educational Attainment (ACS)',
  VEHICLES: 'Vehicle Access (ACS)',
  TENURE: 'Housing Tenure (ACS)',
} as const;
