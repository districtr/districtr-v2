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

// ACS 2019-2023 socioeconomic universes (each with its own denominator).
export const AGEColumnConfig: DemographyTableColumnConfiguration<
  SummaryStatConfig[typeof SUMMARY_TYPES.AGE]
> = [
  {column: 'under_18_pop_23', label: 'Under 18'},
  {column: 'over_65_pop_23', label: '65 and older'},
  {column: 'total_pop_23', label: 'Total (ACS)', isTotal: true},
];

export const INCOMEColumnConfig: DemographyTableColumnConfiguration<
  SummaryStatConfig[typeof SUMMARY_TYPES.INCOME]
> = [
  {column: 'hh_inc_under_35k_23', label: 'Under $35k'},
  {column: 'hh_inc_35k_75k_23', label: '$35k–$75k'},
  {column: 'hh_inc_75k_125k_23', label: '$75k–$125k'},
  {column: 'hh_inc_125k_plus_23', label: '$125k+'},
  {column: 'total_hh_23', label: 'Total households', isTotal: true},
];

export const EDUCATIONColumnConfig: DemographyTableColumnConfiguration<
  SummaryStatConfig[typeof SUMMARY_TYPES.EDUCATION]
> = [
  {column: 'bachelors_plus_23', label: "Bachelor's or higher"},
  {column: 'total_pop_25plus_23', label: 'Total 25 and older', isTotal: true},
];

export const VEHICLESColumnConfig: DemographyTableColumnConfiguration<
  SummaryStatConfig[typeof SUMMARY_TYPES.VEHICLES]
> = [
  {column: 'hh_no_vehicle_23', label: 'No vehicle'},
  {column: 'total_occ_hh_23', label: 'Total households', isTotal: true},
];

export const CONFIG_BY_COLUMN_SET: Record<
  SummaryType,
  DemographyTableColumnConfiguration<SummaryStatConfig[SummaryType]>
> = {
  TOTPOP: TOTPOPColumnConfig,
  VAP: VAPColumnConfig,
  VOTERHISTORY: VoterColumnConfig,
  AGE: AGEColumnConfig,
  INCOME: INCOMEColumnConfig,
  EDUCATION: EDUCATIONColumnConfig,
  VEHICLES: VEHICLESColumnConfig,
};

export const evalColumnConfigs: Partial<
  Record<SummaryType, DemographyTableColumnConfiguration<SummaryStatConfig[SummaryType]>>
> = {
  TOTPOP: TOTPOPColumnConfig,
  VAP: VAPColumnConfig,
  VOTERHISTORY: VoterColumnConfig,
  AGE: AGEColumnConfig,
  INCOME: INCOMEColumnConfig,
  EDUCATION: EDUCATIONColumnConfig,
  VEHICLES: VEHICLESColumnConfig,
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
  {
    value: SUMMARY_TYPES.AGE,
    label: 'Age',
    supportedModes: [TABLE_DISPLAY_MODES.SHARE, TABLE_DISPLAY_MODES.COUNT],
  },
  {
    value: SUMMARY_TYPES.INCOME,
    label: 'Household income',
    supportedModes: [TABLE_DISPLAY_MODES.SHARE, TABLE_DISPLAY_MODES.COUNT],
  },
  {
    value: SUMMARY_TYPES.EDUCATION,
    label: 'Education',
    supportedModes: [TABLE_DISPLAY_MODES.SHARE, TABLE_DISPLAY_MODES.COUNT],
  },
  {
    value: SUMMARY_TYPES.VEHICLES,
    label: 'Vehicle access',
    supportedModes: [TABLE_DISPLAY_MODES.SHARE, TABLE_DISPLAY_MODES.COUNT],
  },
];
