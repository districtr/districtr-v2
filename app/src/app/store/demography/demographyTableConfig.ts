import {DemographyTableColumnConfiguration, SummaryStatConfig} from '@/app/utils/api/summaryStats';
import {SUMMARY_TYPES, type SummaryType} from '@constants/demography/summary';
import {NUMBER_FORMATS, type NumberFormat} from '@constants/demography/format';
import {
  TABLE_DISPLAY_MODES,
  type TableDisplayMode,
} from '@constants/demography/demographyTableMode';

export const TOTPOPColumnConfig: DemographyTableColumnConfiguration<
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
  {
    label: 'Total',
    column: 'total_pop_20',
    isTotal: true,
  },
];

export const VAPColumnConfig: DemographyTableColumnConfiguration<
  SummaryStatConfig[typeof SUMMARY_TYPES.VAP]
> = [
  {column: 'bvap_20', label: 'Black'},
  {column: 'hvap_20', label: 'Hispanic'},
  {column: 'amin_vap_20', label: 'AMIN'},
  {column: 'asian_nhpi_vap_20', label: 'Asian'},
  {column: 'white_vap_20', label: 'White'},
  {column: 'other_vap_20', label: 'Other'},
  {label: 'Total', column: 'total_vap_20', isTotal: true},
];
// Columns are the Democratic candidate's votes; the table derives the raw
// two-party share (X_dem_pct) and swaps to X_rep for the Republican POV.
export const VoterColumnConfig: DemographyTableColumnConfiguration<
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
  DemographyTableColumnConfiguration<SummaryStatConfig[SummaryType]>
> = {
  TOTPOP: TOTPOPColumnConfig,
  VAP: VAPColumnConfig,
  VOTERHISTORY: VoterColumnConfig,
};

export const evalColumnConfigs: Partial<
  Record<SummaryType, DemographyTableColumnConfiguration<SummaryStatConfig[SummaryType]>>
> = {
  TOTPOP: TOTPOPColumnConfig,
  VAP: VAPColumnConfig,
  VOTERHISTORY: VoterColumnConfig,
};

export const modeButtonConfig: Array<{label: string; value: TableDisplayMode}> = [
  {
    label: 'Population by Share',
    value: TABLE_DISPLAY_MODES.SHARE,
  },
  {
    label: 'Population by Count',
    value: TABLE_DISPLAY_MODES.COUNT,
  },
];

export const numberFormats: Record<TableDisplayMode, NumberFormat> = {
  [TABLE_DISPLAY_MODES.SHARE]: NUMBER_FORMATS.PERCENT,
  [TABLE_DISPLAY_MODES.COUNT]: NUMBER_FORMATS.STRING,
};

export const summaryStatLabels: Array<{
  value: SummaryType;
  label: string;
  supportedModes: TableDisplayMode[];
}> = [
  {
    value: SUMMARY_TYPES.TOTPOP,
    label: 'Total population',
    supportedModes: [TABLE_DISPLAY_MODES.SHARE, TABLE_DISPLAY_MODES.COUNT],
  },
  {
    value: SUMMARY_TYPES.VAP,
    label: 'Voting age population',
    supportedModes: [TABLE_DISPLAY_MODES.SHARE, TABLE_DISPLAY_MODES.COUNT],
  },
  {
    value: SUMMARY_TYPES.VOTERHISTORY,
    label: 'Voter history',
    supportedModes: [TABLE_DISPLAY_MODES.SHARE],
  },
];
