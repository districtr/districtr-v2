import {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
} from 'maplibre-gl';
import {useMapStore} from '../store/mapStore';
import {colorScheme} from './colors';
import GeometryWorker from '../utils/GeometryWorker';
import {useChartStore} from '../store/chartStore';

export const BLOCK_SOURCE_ID = 'blocks';
export const BLOCK_LAYER_ID = 'blocks';
export const BLOCK_LAYER_ID_HIGHLIGHT = BLOCK_LAYER_ID + '-highlight';
export const BLOCK_LAYER_ID_HIGHLIGHT_CHILD = BLOCK_LAYER_ID + '-highlight-child';
export const BLOCK_LAYER_ID_CHILD = 'blocks-child';
export const BLOCK_HOVER_LAYER_ID = `${BLOCK_LAYER_ID}-hover`;
export const BLOCK_HOVER_LAYER_ID_CHILD = `${BLOCK_LAYER_ID_CHILD}-hover`;

export const INTERACTIVE_LAYERS = [BLOCK_HOVER_LAYER_ID, BLOCK_HOVER_LAYER_ID_CHILD];
export const LINE_LAYERS = [BLOCK_LAYER_ID, BLOCK_LAYER_ID_CHILD] as const;
export const ZONE_LABEL_LAYERS = ['ZONE_OUTLINE', 'ZONE_LABEL', 'ZONE_LABEL_BG'];
export const PARENT_LAYERS = [BLOCK_LAYER_ID, BLOCK_HOVER_LAYER_ID];
export const COUNTY_LAYERS = ['counties_fill', 'counties_boundary', 'counties_labels'];

export const CHILD_LAYERS = [
  BLOCK_LAYER_ID_CHILD,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_LAYER_ID_HIGHLIGHT_CHILD,
];

export const EMPTY_FT_COLLECTION: GeoJSON.FeatureCollection<any> = {type: 'FeatureCollection', features: []};

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

export const ZONE_LABEL_STYLE_DYNAMIC = colorScheme.reduce(
  (val, color, i) => {
    val.push(['==', ['get', 'zone'], i + 1], color); // 1-indexed per mapStore.ts
    return val;
  },
  ['case'] as any
);
ZONE_LABEL_STYLE_DYNAMIC.push('#cecece');

// cast the above as an ExpressionSpecification
// @ts-ignore
export const ZONE_LABEL_STYLE: ExpressionSpecification = ZONE_LABEL_STYLE_DYNAMIC;

export const LAYER_LINE_WIDTHS = {
  [BLOCK_LAYER_ID]: 2,
  [BLOCK_LAYER_ID_CHILD]: 1,
};

export function getLayerFill(
  captiveIds?: Set<string>,
  shatterIds?: Set<string>,
  child?: boolean,
  isDemographic?: boolean
): DataDrivenPropertyValueSpecification<number> {
  const baseOpacity = isDemographic ? 1 : 0.6;
  const innerFillSpec = [
    'case',
    // is broken parent
    ['boolean', ['feature-state', 'broken'], false],
    0,
    // geography is locked
    ['boolean', ['feature-state', 'locked'], false],
    baseOpacity - 0.25,
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
    baseOpacity + 0.3,
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
    baseOpacity + 0.1,
    // zone is selected, fallback, regardless of hover state
    // @ts-ignore
    ['!', ['==', ['feature-state', 'zone'], null]], //< desired behavior but typerror
    baseOpacity + 0.1,
    // hover is true, fallback, regardless of zone state
    ['boolean', ['feature-state', 'hover'], false],
    baseOpacity,
    isDemographic ? baseOpacity - 0.2 : baseOpacity - 0.4,
  ] as unknown as DataDrivenPropertyValueSpecification<number>;
  if (captiveIds?.size) {
    return [
      'case',
      ['!', ['in', ['get', 'path'], ['literal', Array.from(captiveIds)]]],
      baseOpacity - 0.25,
      innerFillSpec,
    ] as DataDrivenPropertyValueSpecification<number>;
  } else if (shatterIds?.size && !child) {
    return [
      'case',
      ['in', ['get', 'path'], ['literal', Array.from(shatterIds)]],
      0,
      innerFillSpec,
    ] as DataDrivenPropertyValueSpecification<number>;
  } else {
    return innerFillSpec;
  }
}

const getDissolved = async () => {
  const activeZones = useChartStore
    .getState()
    .chartInfo?.chartData?.filter(f => f.total_pop > 0)
    ?.map(f => f.zone);
  const {getMapRef} = useMapStore.getState();
  const mapRef = getMapRef();
  if (!mapRef || !GeometryWorker || !activeZones?.length) return;
  const currentView = mapRef.getBounds();
  const {centroids, dissolved} = await GeometryWorker.getCentroidsFromView({
    bounds: [
      currentView.getWest(),
      currentView.getSouth(),
      currentView.getEast(),
      currentView.getNorth(),
    ],
    activeZones,
    fast: true,
  });
  return {centroids, dissolved};
};

export {getDissolved};
