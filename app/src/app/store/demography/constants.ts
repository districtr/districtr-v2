'use client';
import * as chromatic from 'd3-scale-chromatic';
import {
  ALL_VOTER_COLUMN_GROUPINGS,
  DemographyRow,
  MapColumnConfiguration,
  SummaryStatConfig,
} from '@utils/api/summaryStats';
import {scaleLinear} from '@visx/scale';
import {AnyD3Scale} from './types';
import {type SummaryType} from '@constants/demography/summary';

export const DEFAULT_COLOR_SCHEME = chromatic.schemeBlues;
export const DEFAULT_COLOR_SCHEME_GRAY = chromatic.schemeGreys;
export const DEFAULT_CHOROPLETH_BIN_COUNT = 5;

export const PARTISAN_SCALE = scaleLinear()
  .domain(Array.from({length: 11}, (_, i) => i / 10))
  .range(chromatic.schemeRdBu[11]) as AnyD3Scale;

// type up some abstractions / api layer stuff
// tabular configuration
export const choroplethMapVariables: {
  [K in SummaryType]: MapColumnConfiguration<SummaryStatConfig[K]>;
} = {
  TOTPOP: [
    {
      label: 'Total',
      value: 'total_pop_20',
      colorScheme: chromatic.schemeBuGn,
    },
    {
      label: 'Black',
      value: 'bpop_20',
      variants: ['percent', 'raw'],
    },
    {
      label: 'Hispanic',
      value: 'hpop_20',
      variants: ['percent', 'raw'],
    },
    {
      label: 'Asian',
      value: 'asian_nhpi_pop_20',
      variants: ['percent', 'raw'],
    },
    {
      label: 'AMIN',
      value: 'amin_pop_20',
      variants: ['percent', 'raw'],
    },
    {
      label: 'White',
      value: 'white_pop_20',
      variants: ['percent', 'raw'],
    },
    {
      label: 'Other',
      value: 'other_pop_20',
      variants: ['percent', 'raw'],
    },
  ],
  VAP: [
    {
      label: 'VAP Total',
      value: 'total_vap_20',
    },
    {
      label: 'VAP Black',
      value: 'bvap_20',
      variants: ['percent', 'raw'],
    },
    {
      label: 'VAP Hispanic',
      value: 'hvap_20',
      variants: ['percent', 'raw'],
    },
    {
      label: 'VAP Asian',
      value: 'asian_nhpi_vap_20',
      variants: ['percent', 'raw'],
    },
    {
      label: 'VAP AMIN',
      value: 'amin_vap_20',
      variants: ['percent', 'raw'],
    },
    {
      label: 'VAP White',
      value: 'white_vap_20',
      variants: ['percent', 'raw'],
    },
    {
      label: 'VAP Other',
      value: 'other_vap_20',
      variants: ['percent', 'raw'],
    },
  ],
  VOTERHISTORY: [
    ...Object.entries(ALL_VOTER_COLUMN_GROUPINGS).map(([label, {columns}]) => ({
      label: `${label}`,
      value: columns[0],
      fixedScale: PARTISAN_SCALE,
      customLegendLabels: ['100% Rep', 'Even', '100% Dem'],
      // Current voter history data has two columns always, dem and rep
      expression: (row: DemographyRow) => {
        return row[columns[0]] / (row[columns[1]] + row[columns[0]]);
      },
    })),
  ],
} as const;
