import {NumberFormats} from '@/app/utils/numbers';
import {
  EvalColumnConfiguration,
  SummaryStatConfig,
  summaryStatsConfig,
} from '@/app/utils/api/summaryStats';

export type EvalModes = 'share' | 'count' | 'totpop';

export const TOTPOPColumnConfig: EvalColumnConfiguration<SummaryStatConfig['TOTPOP']> = [
  {
    label: 'Black',
    column: 'bpop_20',
  },
  {
    label: 'Hispanic',
    column: 'hpop_20',
  },
  {
    label: 'AMIN',
    column: 'amin_pop_20',
  },
  {
    label: 'Asian',
    column: 'asian_nhpi_pop_20',
  },
  {
    label: 'White',
    column: 'white_pop_20',
  },
  {
    label: 'Other',
    column: 'other_pop_20',
  },
];

export const VAPColumnConfig: EvalColumnConfiguration<SummaryStatConfig['VAP']> = [
  {column: 'bvap_20', label: 'Black'},
  {column: 'hvap_20', label: 'Hispanic'},
  {column: 'amin_vap_20', label: 'AMIN'},
  {column: 'asian_nhpi_vap_20', label: 'Asian'},
  {column: 'white_vap_20', label: 'White'},
  {column: 'other_vap_20', label: 'Other'},
];

export const VoterColumnConfig: EvalColumnConfiguration<SummaryStatConfig['VOTERHISTORY']> = [
  {column: 'pres_20_rep', label: '2020 Pres (R)'},
  {column: 'pres_20_dem', label: '2020 Pres (D)'},
  {column: 'pres_16_rep', label: '2016 Pres (R)'},
  {column: 'pres_16_dem', label: '2016 Pres (D)'},

  {column: 'gov_22_rep', label: '2022 Gov (R)'},
  {column: 'gov_22_dem', label: '2022 Gov (D)'},
  {column: 'gov_18_rep', label: '2018 Gov (R)'},
  {column: 'gov_18_dem', label: '2018 Gov (D)'},

  {column: 'sen_22_rep', label: '2022 Sen (R)'},
  {column: 'sen_22_dem', label: '2022 Sen (D)'},
  {column: 'sen_18_rep', label: '2018 Sen (R)'},
  {column: 'sen_18_dem', label: '2018 Sen (D)'},
  {column: 'sen_16_rep', label: '2016 Sen (R)'},
  {column: 'sen_16_dem', label: '2016 Sen (D)'},

  {column: 'ag_22_rep', label: '2022 AG (R)'},
  {column: 'ag_22_dem', label: '2022 AG (D)'},
  {column: 'ag_18_rep', label: '2018 AG (R)'},
  {column: 'ag_18_dem', label: '2018 AG (D)'},
];

export const evalColumnConfigs: Partial<
  Record<
    keyof typeof summaryStatsConfig,
    EvalColumnConfiguration<SummaryStatConfig[keyof SummaryStatConfig]>
  >
> = {
  TOTPOP: TOTPOPColumnConfig,
  VAP: VAPColumnConfig,
  VOTERHISTORY: VoterColumnConfig,
};

export const modeButtonConfig: Array<{label: string; value: EvalModes}> = [
  {
    label: 'Population by Share',
    value: 'share',
  },
  {
    label: 'Population by Count',
    value: 'count',
  },
];

export const numberFormats: Record<EvalModes, NumberFormats> = {
  share: 'percent',
  count: 'string',
  totpop: 'percent',
};

export const summaryStatLabels: Array<{
  value: keyof SummaryStatConfig;
  label: string;
}> = [
  {
    value: 'VAP',
    label: 'Voting age population',
  },
  {
    value: 'TOTPOP',
    label: 'Total population',
  },
  {
    value: 'VOTERHISTORY',
    label: 'Voter history',
  },
];
