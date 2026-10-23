import {
  tomato,
  red,
  ruby,
  crimson,
  pink,
  plum,
  purple,
  violet,
  iris,
  indigo,
  blue,
  cyan,
  teal,
  jade,
  green,
  grass,
  orange,
  amber,
  yellow,
  gold,
  brown,
  bronze,
  gray,
  mint,
  lime,
  sky,
} from '@radix-ui/colors';
import {
  schemeAccent,
  schemeCategory10,
  schemeDark2,
  schemePaired,
  schemePastel1,
  schemePastel2,
  schemeSet1,
  schemeSet2,
  schemeSet3,
  schemeTableau10,
} from 'd3-scale-chromatic';

export const colorScheme = [
  '#0099cd',
  '#ffca5d',
  '#00cd99',
  '#99cd00',
  '#cd0099',
  '#aa44ef', // lighter, req from San Diego
  // Color brewer:
  '#8dd3c7',
  '#bebada',
  '#fb8072',
  '#80b1d3',
  '#fdb462',
  '#b3de69',
  '#fccde5',
  '#bc80bd',
  '#ccebc5',
  '#ffed6f',
  '#ffffb3',
  // other color brewer scheme:
  '#a6cee3',
  '#1f78b4',
  '#b2df8a',
  '#33a02c',
  '#fb9a99',
  '#e31a1c',
  '#fdbf6f',
  '#ff7f00',
  '#cab2d6',
  '#6a3d9a',
  '#b15928',
  // random material design colors:
  '#64ffda',
  '#00B8D4',
  '#A1887F',
  '#76FF03',
  '#DCE775',
  '#B388FF',
  '#FF80AB',
  '#D81B60',
  '#26A69A',
  '#FFEA00',
  '#6200EA',
];

// Grays (#rrggbb with r = g = b) read as unassigned land, and the lightest
// ones vanish on the basemap, so the ColorBrewer sets drop them.
const withoutGrays = (colors: readonly string[]) =>
  colors.filter(color => !/^#([0-9a-f]{2})\1\1$/i.test(color));

/** Standard palettes a user can apply to all districts at once. */
export const DISTRICT_PALETTES: {name: string; colors: readonly string[]}[] = [
  {name: 'Districtr default', colors: colorScheme},
  {name: 'Tableau 10', colors: schemeTableau10},
  {name: 'D3 Category 10', colors: schemeCategory10},
  // Okabe-Ito without its black, which would hide the map under a district fill.
  {
    name: 'Okabe-Ito',
    colors: ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7'],
  },
  {name: 'ColorBrewer Set1', colors: withoutGrays(schemeSet1)},
  {name: 'ColorBrewer Set2', colors: withoutGrays(schemeSet2)},
  {name: 'ColorBrewer Set3', colors: withoutGrays(schemeSet3)},
  {name: 'ColorBrewer Dark2', colors: withoutGrays(schemeDark2)},
  {name: 'ColorBrewer Paired', colors: withoutGrays(schemePaired)},
  {name: 'ColorBrewer Accent', colors: withoutGrays(schemeAccent)},
  {name: 'ColorBrewer Pastel1', colors: withoutGrays(schemePastel1)},
  {name: 'ColorBrewer Pastel2', colors: withoutGrays(schemePastel2)},
];
