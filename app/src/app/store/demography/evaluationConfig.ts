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
// Columns are the Democratic candidate's votes; the table derives the raw
// two-party share (X_dem_pct) and swaps to X_rep for the Republican POV.
export const VoterColumnConfig: EvalColumnConfiguration<
  SummaryStatConfig[typeof SUMMARY_TYPES.VOTERHISTORY]
> = [
  {column: 'sen_22_dem', label: '2022 Sen'},
  {column: 'gov_22_dem', label: '2022 Gov'},
  {column: 'ag_22_dem', label: '2022 AG'},
  {column: 'pres_20_dem', label: '2020 Pres'},
  {column: 'sen_18_dem', label: '2018 Sen'},
  {column: 'gov_18_dem', label: '2018 Gov'},
  {column: 'ag_18_dem', label: '2018 AG'},
  {column: 'pres_16_dem', label: '2016 Pres'},
  {column: 'sen_16_dem', label: '2016 Sen'},
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
