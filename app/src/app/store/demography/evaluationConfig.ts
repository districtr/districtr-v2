import {NumberFormats} from '@/app/utils/numbers';
import {
  EvalColumnConfiguration,
  SummaryStatConfig,
  summaryStatsConfig,
} from '@/app/utils/api/summaryStats';

export type EvalModes = 'share' | 'count' | 'totpop' | 'partisan';

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
// TODO FIX typing
export const VoterColumnConfig: EvalColumnConfiguration<any> = [
  {column: 'pres_20_lean', label: '2020 Pres'},
  {column: 'pres_16_lean', label: '2016 Pres'},
  {column: 'gov_22_lean', label: '2022 Gov'},
  {column: 'gov_18_lean', label: '2018 Gov'},
  {column: 'sen_22_lean', label: '2022 Sen'},
  {column: 'sen_18_lean', label: '2018 Sen'},
  {column: 'sen_16_lean', label: '2016 Sen'},
  {column: 'ag_22_lean', label: '2022 AG'},
  {column: 'ag_18_lean', label: '2018 AG'},
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
  partisan: 'partisan',
};

export const summaryStatLabels: Array<{
  value: keyof SummaryStatConfig;
  label: string;
  supportedModes: EvalModes[];
}> = [
  {
    value: 'VAP',
    label: 'Voting age population',
    supportedModes: ['share', 'count'],
  },
  {
    value: 'TOTPOP',
    label: 'Total population',
    supportedModes: ['share', 'count']
  },
  {
    value: 'VOTERHISTORY',
    label: 'Voter history',
    supportedModes: ['share']
  },
];
