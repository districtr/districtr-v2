import {DataDrivenPropertyValueSpecification, ExpressionSpecification} from 'maplibre-gl';
import {useMapStore} from '../store/mapStore';
import GeometryWorker from '../utils/GeometryWorker';
import euclideanDistance from '@turf/distance';
import {demographyCache} from '../utils/demography/demographyCache';
export {FALLBACK_NUM_DISTRICTS, OVERLAY_OPACITY} from './mapDefaults';
export const BLOCK_SOURCE_ID = 'blocks';
export const BLOCK_LAYER_ID = 'blocks';
export const BLOCK_POINTS_LAYER_ID = 'blocks-points';
export const BLOCK_LAYER_ID_HIGHLIGHT = BLOCK_LAYER_ID + '-highlight';
export const BLOCK_LAYER_ID_HIGHLIGHT_CHILD = BLOCK_LAYER_ID + '-highlight-child';
export const BLOCK_LAYER_ID_CHILD = 'blocks-child';
export const BLOCK_POINTS_LAYER_ID_CHILD = 'blocks-points-child';
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

export const EMPTY_FT_COLLECTION: GeoJSON.FeatureCollection<any> = {
  type: 'FeatureCollection',
  features: [],
};

export const COUNTY_LAYER_IDS: string[] = ['counties_boundary', 'counties_labels'];

export const LABELS_BREAK_LAYER_ID = 'places_subplace';

export const ZONE_ASSIGNMENT_STYLE = (colorScheme: string[]) => {
  const colorStyleBaseline: any[] = ['case'];
  let group = [...colorScheme].reduce((val, color, i) => {
    val.push(['==', ['feature-state', 'zone'], i + 1], color); // 1-indexed per mapStore.ts
    return val;
  }, colorStyleBaseline);
  group.push('#cecece');
  return group as ExpressionSpecification;
};

export const ZONE_LABEL_STYLE = (colorScheme: string[]) => {
  let group = [...colorScheme].reduce(
    (val, color, i) => {
      val.push(['==', ['get', 'zone'], i + 1], color); // 1-indexed per mapStore.ts
      return val;
    },
    ['case'] as any
  );
  group.push('#cecece');
  return group as ExpressionSpecification;
};

export const LAYER_LINE_WIDTHS = {
  [BLOCK_LAYER_ID]: 2,
  [BLOCK_LAYER_ID_CHILD]: 1,
};

export function getLayerFill(
  captiveIds?: Set<string>,
  child?: boolean,
  isDemographic?: boolean
): DataDrivenPropertyValueSpecification<number> {
  const baseOpacity = isDemographic ? 1 : 0.6;
  const innerFillSpec = [
    'case',
    // is broken parent
    ['boolean', ['feature-state', 'broken'], false],
    0,
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
    // zone is selected, fallback, regardless of hover state
    // @ts-ignore
    ['!', ['==', ['feature-state', 'zone'], null]], //< desired behavior but typerror
    baseOpacity + 0.1,
    isDemographic ? baseOpacity - 0.2 : baseOpacity - 0.4,
  ] as unknown as DataDrivenPropertyValueSpecification<number>;
  if (captiveIds?.size) {
    return [
      'case',
      ['!', ['in', ['get', 'path'], ['literal', Array.from(captiveIds)]]],
      baseOpacity - 0.25,
      innerFillSpec,
    ] as DataDrivenPropertyValueSpecification<number>;
  } else {
    return innerFillSpec;
  }
}

const getDissolved = async () => {
  const activeZones = demographyCache.populations
    .filter(row => row.total_pop_20 > 0)
    .map(f => f.zone);
  const {getMapRef} = useMapStore.getState();
  const mapRef = getMapRef();
  if (!mapRef || !GeometryWorker || !activeZones?.length) return;
  const currentView = mapRef.getBounds();
  const distanceAcrossCanvas = euclideanDistance(
    [currentView.getWest(), currentView.getNorth()],
    [currentView.getEast(), currentView.getNorth()],
    {units: 'kilometers'}
  );
  //px convert to km at current zoom
  const bufferInKm = 50 / (mapRef.getCanvas().width / distanceAcrossCanvas);
  const {centroids, dissolved} = await GeometryWorker.getCentroidsFromView({
    bounds: [
      currentView.getWest(),
      currentView.getSouth(),
      currentView.getEast(),
      currentView.getNorth(),
    ],
    activeZones,
    strategy: 'center-of-mass',
    minBuffer: bufferInKm,
  });
  return {centroids, dissolved};
};

export {getDissolved};
