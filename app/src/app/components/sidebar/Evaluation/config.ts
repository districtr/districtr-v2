import {NumberFormats} from '@/app/utils/numbers';
import {SummaryStatConfig} from '@/app/utils/api/summaryStats';

export type EvalModes = 'share' | 'count' | 'totpop';
type ColumnConfiguration<T extends string> = Array<{label: string; column: T}>;

export const TOTPOPColumnConfig: ColumnConfiguration<
  SummaryStatConfig['TOTPOP']['possibleColumns'][number]
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

export const VAPColumnConfig: ColumnConfiguration<
  SummaryStatConfig['VAP']['possibleColumns'][number]
> = [
  {column: 'bvap_20', label: 'Black'},
  {column: 'hvap_20', label: 'Hispanic'},
  {column: 'amin_vap_20', label: 'AMIN'},
  {column: 'asian_nhpi_vap_20', label: 'Asian'},
  {column: 'white_vap_20', label: 'White'},
  {column: 'other_vap_20', label: 'Other'},
];

export const columnConfigs: Partial<
  Record<
    keyof SummaryStatConfig,
    ColumnConfiguration<SummaryStatConfig[keyof SummaryStatConfig]['possibleColumns'][number]>
  >
> = {
  TOTPOP: TOTPOPColumnConfig,
  VAP: VAPColumnConfig,
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
];
