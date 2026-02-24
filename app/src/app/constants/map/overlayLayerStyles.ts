import type {
  FillLayerSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';

export const DEFAULT_FILL_STYLE: Partial<FillLayerSpecification['paint']> = {
  'fill-color': '#627BC1',
  'fill-opacity': 0.3,
  'fill-outline-color': '#627BC1',
};

export const DEFAULT_LINE_STYLE: Partial<LineLayerSpecification['paint']> = {
  'line-color': '#627BC1',
  'line-width': 2,
  'line-opacity': 0.8,
};

export const DEFAULT_TEXT_PAINT: Partial<SymbolLayerSpecification['paint']> = {
  'text-color': '#627BC1',
  'text-halo-color': '#fff',
  'text-halo-width': 1.5,
};

export const DEFAULT_TEXT_LAYOUT: Partial<SymbolLayerSpecification['layout']> = {
  'text-font': ['Barlow Bold'],
  'text-size': 14,
  'text-anchor': 'center',
  'text-max-width': 10,
};

export const SELECTED_LINE_STYLE: Partial<LineLayerSpecification['paint']> = {
  'line-color': '#FF6B00',
  'line-width': 3,
  'line-opacity': 1,
};

export const HIGHLIGHT_FILL_COLOR: Partial<FillLayerSpecification['paint']> = {
  'fill-color': '#000000',
  'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.7, 0],
};
