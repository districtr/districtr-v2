'use client';
import * as chromatic from 'd3-scale-chromatic';
import {
  ALL_VOTER_COLUMN_GROUPINGS,
  DemographyRow,
  MapColumnConfiguration,
  SummaryStatConfig,
} from '@utils/api/summaryStats';
import {scaleLinear} from '@visx/scale';
import {type ScaleLinear} from 'd3-scale';
import {type SummaryType} from '@constants/demography/summary';

export const DEFAULT_COLOR_SCHEME = chromatic.schemeBlues;
export const DEFAULT_CONTINUOUS_COLOR_SCHEME = chromatic.interpolateBlues;
// Sized circles and the overlay choropleth sit on top of colored districts,
// so shade transparent-to-black (an alpha ramp) instead of white-to-black
export const SIZED_CIRCLE_COLOR_SCHEME = (t: number) => `rgba(0, 0, 0, ${t})`;
export const DEFAULT_CONTINUOUS_COLOR_SCHEME_GRAY = SIZED_CIRCLE_COLOR_SCHEME;
// Binned equivalent of d3's schemeGreys: index k holds k bins ramping alpha 0→1
export const DEFAULT_COLOR_SCHEME_GRAY = Array.from({length: 10}, (_, k) =>
  Array.from({length: k}, (_, i) => `rgba(0, 0, 0, ${k > 1 ? +(i / (k - 1)).toFixed(2) : 1})`)
);
export const DEFAULT_CHOROPLETH_BIN_COUNT = 5;

export const PARTISAN_SCALE = scaleLinear()
  .domain(Array.from({length: 11}, (_, i) => i / 10))
  .range(chromatic.schemeRdBu[11]) as unknown as ScaleLinear<number, string>;

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
  AGE: [
    {
      label: 'Under 18',
      value: 'under_18_pop_23',
      variants: ['percent', 'raw'],
      colorScheme: chromatic.schemePuBu,
    },
    {
      label: '65 and older',
      value: 'over_65_pop_23',
      variants: ['percent', 'raw'],
      colorScheme: chromatic.schemePuBu,
    },
  ],
  INCOME: [
    {
      label: 'Household income under $35k',
      value: 'hh_inc_under_35k_23',
      variants: ['percent', 'raw'],
      colorScheme: chromatic.schemeYlGnBu,
    },
    {
      label: 'Household income $35k–$75k',
      value: 'hh_inc_35k_75k_23',
      variants: ['percent', 'raw'],
      colorScheme: chromatic.schemeYlGnBu,
    },
    {
      label: 'Household income $75k–$125k',
      value: 'hh_inc_75k_125k_23',
      variants: ['percent', 'raw'],
      colorScheme: chromatic.schemeYlGnBu,
    },
    {
      label: 'Household income $125k+',
      value: 'hh_inc_125k_plus_23',
      variants: ['percent', 'raw'],
      colorScheme: chromatic.schemeYlGnBu,
    },
  ],
  EDUCATION: [
    {
      label: "Bachelor's degree or higher",
      value: 'bachelors_plus_23',
      variants: ['percent', 'raw'],
      colorScheme: chromatic.schemeGnBu,
    },
  ],
  VEHICLES: [
    {
      label: 'Households with no vehicle',
      value: 'hh_no_vehicle_23',
      variants: ['percent', 'raw'],
      colorScheme: chromatic.schemeOrRd,
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
