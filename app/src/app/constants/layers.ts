import {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
} from 'maplibre-gl';
import {MapStore} from '../store/mapStore';
import {colorScheme} from './colors';

export const BLOCK_SOURCE_ID = 'blocks';
export const BLOCK_LAYER_ID = 'blocks';
export const BLOCK_LAYER_ID_HIGHLIGHT = BLOCK_LAYER_ID + '-highlight';
export const BLOCK_LAYER_ID_HIGHLIGHT_CHILD = BLOCK_LAYER_ID + '-highlight-child';
export const BLOCK_LAYER_ID_CHILD = 'blocks-child';
export const BLOCK_HOVER_LAYER_ID = `${BLOCK_LAYER_ID}-hover`;
export const BLOCK_HOVER_LAYER_ID_CHILD = `${BLOCK_LAYER_ID_CHILD}-hover`;

export const INTERACTIVE_LAYERS = [BLOCK_HOVER_LAYER_ID, BLOCK_HOVER_LAYER_ID_CHILD];
export const LINE_LAYERS = [BLOCK_LAYER_ID, BLOCK_LAYER_ID_CHILD] as const

export const PARENT_LAYERS = [BLOCK_LAYER_ID, BLOCK_HOVER_LAYER_ID]; 
export const COUNTY_LAYERS = ['counties_fill', 'counties_boundary','counties_labels']

export const CHILD_LAYERS = [
  BLOCK_LAYER_ID_CHILD,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_LAYER_ID_HIGHLIGHT_CHILD,
];

export const DEFAULT_PAINT_STYLE: ExpressionSpecification = [
  'case',
  ['boolean', ['feature-state', 'hover'], false],
  '#FF0000',
  '#000000',
];

export const COUNTY_LAYER_IDS: string[] = ['counties_boundary', 'counties_labels'];

export const LABELS_BREAK_LAYER_ID = 'places_subplace';

const colorStyleBaseline: any[] = ['case'];

export const ZONE_ASSIGNMENT_STYLE_DYNAMIC = colorScheme.reduce((val, color, i) => {
  val.push(['==', ['feature-state', 'zone'], i + 1], color); // 1-indexed per mapStore.ts
  return val;
}, colorStyleBaseline);
ZONE_ASSIGNMENT_STYLE_DYNAMIC.push('#cecece');

// cast the above as an ExpressionSpecification
// @ts-ignore
export const ZONE_ASSIGNMENT_STYLE: ExpressionSpecification = ZONE_ASSIGNMENT_STYLE_DYNAMIC;

export type StyleBuilderArgs = {
  layerId: string,
  shatterIds?: MapStore['shatterIds'],
  captiveIds?: MapStore['captiveIds'],
  mapOptions?: MapStore['mapOptions'],
  child?: boolean
}
export type StyleBuilder = (args: StyleBuilderArgs) => Partial<LayerSpecification>

export function getLayerFilter(child: boolean, shatterIds?: MapStore['shatterIds']) {
  if (!shatterIds) return undefined
  const ids = child ? shatterIds.children : shatterIds.parents;
  const cleanIds = Boolean(ids) ? Array.from(ids) : [];
  const filterBase: FilterSpecification = ['in', ['get', 'path'], ['literal', cleanIds]];

  if (child) {
    return filterBase;
  }
  const parentFilter: FilterSpecification = ['!', filterBase];
  return parentFilter;
}

export function getLayerFill(
  captiveIds?: Set<string>,
  shatterIds?: Set<string>
): DataDrivenPropertyValueSpecification<number> {
  const captiveCondition = captiveIds
    ? ['!', ['in', ['get', 'path'], ['literal', Array.from(captiveIds)]]]
    : false

  const innerFillSpec = ([
    'case',
    captiveCondition,
    0.35,
    // in shatter IDs
    ['in', ['get', 'path'], ['literal', Array.from(shatterIds || new Set())]],
    0,
    // is broken parent
    ['boolean', ['feature-state', 'broken'], false],
    0,
    // geography is locked
    ['boolean', ['feature-state', 'locked'], false],
    0.35,
    // zone is selected and hover is true and hover is not null
    [
      'all',
      // @ts-ignore
      ['!', ['==', ['feature-state', 'zone'], null]], //< desired behavior but typerror
      [
        'all',
        // @ts-ignore
        ['!', ['==', ['feature-state', 'hover'], null]], //< desired behavior but typerror
        ['boolean', ['feature-state', 'hover'], true],
      ],
    ],
    0.9,
    // zone is selected and hover is false, and hover is not null
    [
      'all',
      // @ts-ignore
      ['!', ['==', ['feature-state', 'zone'], null]], //< desired behavior but typerror
      [
        'all',
        // @ts-ignore
        ['!', ['==', ['feature-state', 'hover'], null]], //< desired behavior but typerror
        ['boolean', ['feature-state', 'hover'], false],
      ],
    ],
    0.7,
    // zone is selected, fallback, regardless of hover state
    // @ts-ignore
    ['!', ['==', ['feature-state', 'zone'], null]], //< desired behavior but typerror
    0.7,
    // hover is true, fallback, regardless of zone state
    ['boolean', ['feature-state', 'hover'], false],
    0.6,
    0.2,
  ] as unknown) as DataDrivenPropertyValueSpecification<number>;
  
  return innerFillSpec;
}

export const getHighlightLayerSpecification: StyleBuilder = ({
  mapOptions
}) => {
  const highlightUnassigned = mapOptions?.higlightUnassigned
  return {
    type: 'line',
    layout: {
      visibility: 'visible',
      'line-cap': 'round',
    },
    paint: {
      'line-opacity': 1,
      'line-color': [
        'case',
        ['boolean', ['feature-state', 'focused'], false],
        '#000000', // Black color when focused
        ['boolean', ['feature-state', 'highlighted'], false],
        '#e5ff00', // yellow color when highlighted
        ['boolean', ['feature-state', 'highlighted'], false],
        '#e5ff00', // yellow color when highlighted
        // @ts-ignore right behavior, wrong types
        ['==', ['feature-state', 'zone'], null],
        '#FF0000', // optionally red color when zone is not assigned
        '#000000', // Default color
      ],
      'line-width': [
        'case',
        [
          'any',
          ['boolean', ['feature-state', 'focused'], false],
          ['boolean', ['feature-state', 'highlighted'], false],
          [
            'all',
            // @ts-ignore correct logic, wrong types
            ['==', ['feature-state', 'zone'], null],
            ['boolean', !!highlightUnassigned],
            ['!', ['boolean', ['feature-state', 'broken'], false]],
          ],
        ],
        3.5,
        0, // Default width if none of the conditions are met
      ],
    },
  } as unknown as Partial<LayerSpecification>
}

export const getBlocksLayerSpecification: StyleBuilder = ({
  child,
  shatterIds
}) => {
  const lineWidth = child ? 1 : 2

  const layerSpec: Partial<LayerSpecification> = {
    type: 'line',
    layout: {
      visibility: 'visible',
    },
    paint: {
      'line-opacity': 0.8,
      // 'line-color': '#aaaaaa', // Default color
      'line-color': ['interpolate', ['exponential', 1.6], ['zoom'], 6, '#aaa', 9, '#777', 14, '#333'],
      'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 6, lineWidth*.125, 9, lineWidth*.35, 14, lineWidth],
    },
  };
  if (child) {
    layerSpec.filter = getLayerFilter(!!child, shatterIds);
  }

  return layerSpec;
}

export const getBlocksHoverLayerSpecification: StyleBuilder = ({
  layerId,
  shatterIds,
  captiveIds, 
  child
}) => {
  const layerSpec: Partial<LayerSpecification> = {
    type: 'fill',
    layout: {
      visibility: 'visible',
    },
    paint: {
      'fill-opacity': getLayerFill(
        shatterIds?.parents,
        captiveIds
      ),
      'fill-color': ZONE_ASSIGNMENT_STYLE || '#000000',
    },
  };
  if (CHILD_LAYERS.includes(layerId)) {
    layerSpec.filter = getLayerFilter(!!child, shatterIds);
  }
  return layerSpec;
}
