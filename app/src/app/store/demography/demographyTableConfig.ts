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
  {column: 'pres_24_dem', label: '2024 Pres'},
  {column: 'sen_24_dem', label: '2024 Sen'},
  {column: 'gov_24_dem', label: '2024 Gov'},
  {column: 'ag_24_dem', label: '2024 AG'},
  {column: 'gov_23_dem', label: '2023 Gov'},
  {column: 'ag_23_dem', label: '2023 AG'},
  {column: 'sen_22_dem', label: '2022 Sen'},
  {column: 'gov_22_dem', label: '2022 Gov'},
  {column: 'ag_22_dem', label: '2022 AG'},
  {column: 'gov_21_dem', label: '2021 Gov'},
  {column: 'ag_21_dem', label: '2021 AG'},
  {column: 'pres_20_dem', label: '2020 Pres'},
  {column: 'sen_20_dem', label: '2020 Sen'},
  {column: 'gov_20_dem', label: '2020 Gov'},
  {column: 'ag_20_dem', label: '2020 AG'},
  {column: 'gov_19_dem', label: '2019 Gov'},
  {column: 'ag_19_dem', label: '2019 AG'},
  {column: 'sen_18_dem', label: '2018 Sen'},
  {column: 'gov_18_dem', label: '2018 Gov'},
  {column: 'ag_18_dem', label: '2018 AG'},
  {column: 'gov_17_dem', label: '2017 Gov'},
  {column: 'ag_17_dem', label: '2017 AG'},
  {column: 'pres_16_dem', label: '2016 Pres'},
  {column: 'sen_16_dem', label: '2016 Sen'},
  {column: 'gov_16_dem', label: '2016 Gov'},
  {column: 'ag_16_dem', label: '2016 AG'},
  {column: 'sen_14_dem', label: '2014 Sen'},
  {column: 'gov_14_dem', label: '2014 Gov'},
  {column: 'ag_14_dem', label: '2014 AG'},
  {column: 'pres_12_dem', label: '2012 Pres'},
  {column: 'pres_08_dem', label: '2008 Pres'},
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
