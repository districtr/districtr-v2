import {EvalColumnConfiguration, SummaryStatConfig} from '@/app/utils/api/summaryStats';
import {SUMMARY_TYPES, type SummaryType} from '@constants/demography/summary';
import {NUMBER_FORMATS, type NumberFormat} from '@constants/demography/format';
import {EVAL_MODES, type EvalMode} from '@constants/demography/evalMode';

export const TOTPOPColumnConfig: EvalColumnConfiguration<
  SummaryStatConfig[typeof SUMMARY_TYPES.TOTPOP]
> = [
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

export const VAPColumnConfig: EvalColumnConfiguration<SummaryStatConfig[typeof SUMMARY_TYPES.VAP]> =
  [
    {column: 'bvap_20', label: 'Black'},
    {column: 'hvap_20', label: 'Hispanic'},
    {column: 'amin_vap_20', label: 'AMIN'},
    {column: 'asian_nhpi_vap_20', label: 'Asian'},
    {column: 'white_vap_20', label: 'White'},
    {column: 'other_vap_20', label: 'Other'},
  ];
// TODO FIX typing
export const VoterColumnConfig: EvalColumnConfiguration<any> = [
  {column: 'sen_22_lean', label: '2022 Sen', sourceCol: 'sen_22_rep'},
  {column: 'gov_22_lean', label: '2022 Gov', sourceCol: 'gov_22_rep'},
  {column: 'ag_22_lean', label: '2022 AG', sourceCol: 'ag_22_rep'},
  {column: 'pres_20_lean', label: '2020 Pres', sourceCol: 'pres_20_rep'},
  {column: 'sen_18_lean', label: '2018 Sen', sourceCol: 'sen_18_rep'},
  {column: 'gov_18_lean', label: '2018 Gov', sourceCol: 'gov_18_rep'},
  {column: 'ag_18_lean', label: '2018 AG', sourceCol: 'ag_18_rep'},
  {column: 'pres_16_lean', label: '2016 Pres', sourceCol: 'pres_16_rep'},
  {column: 'sen_16_lean', label: '2016 Sen', sourceCol: 'sen_16_rep'},
];

export const CONFIG_BY_COLUMN_SET: Record<
  SummaryType,
  EvalColumnConfiguration<SummaryStatConfig[SummaryType]>
> = {
  TOTPOP: TOTPOPColumnConfig,
  VAP: VAPColumnConfig,
  VOTERHISTORY: VoterColumnConfig,
};

export const evalColumnConfigs: Partial<
  Record<SummaryType, EvalColumnConfiguration<SummaryStatConfig[SummaryType]>>
> = {
  TOTPOP: TOTPOPColumnConfig,
  VAP: VAPColumnConfig,
  VOTERHISTORY: VoterColumnConfig,
};

export const modeButtonConfig: Array<{label: string; value: EvalMode}> = [
  {
    label: 'Population by Share',
    value: EVAL_MODES.SHARE,
  },
  {
    label: 'Population by Count',
    value: EVAL_MODES.COUNT,
  },
];

export const numberFormats: Record<EvalMode, NumberFormat> = {
  [EVAL_MODES.SHARE]: NUMBER_FORMATS.PERCENT,
  [EVAL_MODES.COUNT]: NUMBER_FORMATS.STRING,
  [EVAL_MODES.TOTPOP]: NUMBER_FORMATS.PERCENT,
  [EVAL_MODES.PARTISAN]: NUMBER_FORMATS.PARTISAN,
};

export const summaryStatLabels: Array<{
  value: SummaryType;
  label: string;
  supportedModes: EvalMode[];
}> = [
  {
    value: SUMMARY_TYPES.TOTPOP,
    label: 'Total population',
    supportedModes: [EVAL_MODES.SHARE, EVAL_MODES.COUNT],
  },
  {
    value: SUMMARY_TYPES.VAP,
    label: 'Voting age population',
    supportedModes: [EVAL_MODES.SHARE, EVAL_MODES.COUNT],
  },
  {
    value: SUMMARY_TYPES.VOTERHISTORY,
    label: 'Voter history',
    supportedModes: [EVAL_MODES.SHARE],
  },
];
