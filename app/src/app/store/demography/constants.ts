'use client';
import * as chromatic from 'd3-scale-chromatic';
import {AllTabularColumns, DemographyRow} from '@utils/api/summaryStats';
import {scaleLinear} from '@visx/scale';
import { AnyD3Scale } from './types';

export const DEFAULT_COLOR_SCHEME = chromatic.schemeBlues;
export const DEFAULT_COLOR_SCHEME_GRAY = chromatic.schemeGreys;

export const PARTISAN_SCALE = scaleLinear()
  .domain(Array.from({length: 11}, (_, i) => i / 10))
  .range(chromatic.schemeRdBu[11]) as AnyD3Scale;

export const demographyVariables: Array<{
  label: string;
  value: AllTabularColumns[number];
  colorScheme?: typeof chromatic.schemeBlues;
  expression?: (row: DemographyRow) => number;
  fixedScale?: AnyD3Scale
  variants?: Array<'percent' | 'raw'>
  customLegendLabels?: Array<string>
}> = [
  {
    label: 'Population: Total',
    value: 'total_pop_20',
    colorScheme: chromatic.schemeBuGn,
  },
  {
    label: 'Population: Black',
    value: 'bpop_20',
    variants: ['percent', 'raw'],
  },
  {
    label: 'Population: Hispanic',
    value: 'hpop_20',
    variants: ['percent', 'raw'],
  },
  {
    label: 'Population: Asian',
    value: 'asian_nhpi_pop_20',
    variants: ['percent', 'raw'],
  },
  {
    label: 'Population: AMIN',
    value: 'amin_pop_20',
    variants: ['percent', 'raw'],
  },
  {
    label: 'Population: White',
    value: 'white_pop_20',
    variants: ['percent', 'raw'],
  },
  {
    label: 'Population: Other',
    value: 'other_pop_20',
    variants: ['percent', 'raw'],
  },
  {
    label: 'Voting Population: Total',
    value: 'total_vap_20',
  },
  {
    label: 'Voting Population: Black',
    value: 'bvap_20',
    variants: ['percent', 'raw'],
  },
  {
    label: 'Voting Population: Hispanic',
    value: 'hvap_20',
    variants: ['percent', 'raw'],
  },
  {
    label: 'Voting Population: Asian',
    value: 'asian_nhpi_vap_20',
    variants: ['percent', 'raw'],
  },
  {
    label: 'Voting Population: AMIN',
    value: 'amin_vap_20',
    variants: ['percent', 'raw'],
  },
  {
    label: 'Voting Population: White',
    value: 'white_vap_20',
    variants: ['percent', 'raw'],
  },
  {
    label: 'Voting Population: Other',
    value: 'other_vap_20',
    variants: ['percent', 'raw'],
  },
  {
    label: 'Partisan Lean: 2020 Presidential',
    value: 'pres_20_rep',
    expression: (row: DemographyRow) => {
      return row.pres_20_dem / (row.pres_20_rep + row.pres_20_dem);
    },
    fixedScale: PARTISAN_SCALE,
    customLegendLabels: ['+100 (R)', 'Even', '+100 (D)']
  },
] as const;