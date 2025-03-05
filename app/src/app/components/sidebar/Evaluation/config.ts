import {NumberFormats} from '@/app/utils/numbers';
import {
  P1ZoneSummaryStats,
  P4ZoneSummaryStats,
  SummaryTypes,
} from '@/app/utils/api/summaryStats';

export type EvalModes = 'share' | 'count' | 'totpop';
type ColumnConfiguration<T extends Record<string, any>> = Array<{label: string; column: keyof T}>;

export const p1ColumnConfig: ColumnConfiguration<P1ZoneSummaryStats> = [
  {
    label: 'White',
    column: 'white_pop',
  },
  {
    label: 'Black',
    column: 'black_pop',
  },
  {
    label: 'Asian',
    column: 'asian_pop',
  },
  {
    label: 'Am. Indian',
    column: 'amin_pop',
  },
  {
    label: 'Pacific Isl.',
    column: 'nhpi_pop',
  },
  {
    label: 'Two or More Races',
    column: 'two_or_more_races_pop',
  },
  {
    label: 'Other',
    column: 'other_pop',
  },
];

export const p4ColumnConfig: ColumnConfiguration<P4ZoneSummaryStats> = [
  {column: 'hispanic_vap', label: 'Hispanic'},
  {column: 'non_hispanic_asian_vap', label: 'Non-hispanic Asian'},
  {column: 'non_hispanic_amin_vap', label: 'Non-hispanic Amin.'},
  {column: 'non_hispanic_nhpi_vap', label: 'Non-hispanic NHPI'},
  {column: 'non_hispanic_black_vap', label: 'Non-hispanic Black'},
  {column: 'non_hispanic_white_vap', label: 'Non-hispanic White'},
  {column: 'non_hispanic_other_vap', label: 'Non-hispanic Other'},
  {column: 'non_hispanic_two_or_more_races_vap', label: 'Non-hispanic 2+ Races'},
];

export const columnConfigs = {
  P1: p1ColumnConfig,
  P4: p4ColumnConfig,
} as const;

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
  value: keyof SummaryTypes;
  label: string;
}> = [
  {
    value: 'P4',
    label: 'Voting age population',
  },
  {
    value: 'P1',
    label: 'Total population',
  }
]
