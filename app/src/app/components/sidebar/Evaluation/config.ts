import {NumberFormats} from '@/app/utils/numbers';
import {
  TOTPOPZoneSummaryStats,
  VAPZoneSummaryStats,
  SummaryTypes,
} from '@/app/utils/api/summaryStats';

export type EvalModes = 'share' | 'count' | 'totpop';
type ColumnConfiguration<T extends Record<string, any>> = Array<{label: string; column: keyof T}>;

export const TOTPOPColumnConfig: ColumnConfiguration<TOTPOPZoneSummaryStats> = [
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
  }
];

export const VAPColumnConfig: ColumnConfiguration<VAPZoneSummaryStats> = [
  {column: "bvap_20", label: "Black"},
  {column: "hvap_20", label: "Hispanic"},
  {column: "amin_vap_20", label: "AMIN"},
  {column: "asian_nhpi_vap_20", label: "Asian"},
  {column: "white_vap_20", label: "White"},
  {column: "other_vap_20", label: "Other"}
];

export const columnConfigs = {
  TOTPOP: TOTPOPColumnConfig,
  VAP: VAPColumnConfig,
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
  value: SummaryTypes;
  label: string;
}> = [
  {
    value: 'VAP',
    label: 'Voting age population',
  },
  {
    value: 'TOTPOP',
    label: 'Total population',
  }
]
