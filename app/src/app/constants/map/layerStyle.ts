import {DataDrivenPropertyValueSpecification, ExpressionSpecification} from 'maplibre-gl';
export {FALLBACK_NUM_DISTRICTS, OVERLAY_OPACITY} from '../document/limits';

export const EMPTY_FT_COLLECTION = {
  type: 'FeatureCollection',
  features: [],
} as const satisfies GeoJSON.FeatureCollection<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>;

// Sometimes, maplibre requires non-empty arrays for specifications
// This serves as a placeholder for otherwise empty arrays
export const SENTINEL_EMPTY_VALUE: string = '-999';
export const SENTINEL_EMPTY_ARRAY: string[] = [SENTINEL_EMPTY_VALUE];

export const HIGHLIGHT_LINE_COLOR = '#666666';
export const HIGHLIGHT_LINE_WIDTH = 3.5;

export const COMMUNITY_ASSIGNMENT_STYLE = (colorScheme: string[]) => {
  const colorStyleBaseline: any[] = ['case'];
  let group = [...colorScheme].reduce((val, color, i) => {
    val.push(['==', ['feature-state', 'community'], i + 1], color); // 1-indexed per mapStore.ts
    return val;
  }, colorStyleBaseline);
  group.push('#cecece');
  return group as ExpressionSpecification;
};

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

export function getLayerFill(
  captiveIds?: Set<string>,
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
    0,
  ] as unknown as DataDrivenPropertyValueSpecification<number>;
  if (captiveIds?.size) {
    return [
      'case',
      ['boolean', ['feature-state', 'broken'], false],
      0,
      // @ts-ignore
      ['!', ['==', ['feature-state', 'zone'], null]],
      [
        'case',
        ['!', ['in', ['get', 'path'], ['literal', Array.from(captiveIds)]]],
        baseOpacity - 0.25,
        innerFillSpec,
      ],
      0,
    ] as unknown as DataDrivenPropertyValueSpecification<number>;
  } else {
    return innerFillSpec;
  }
}
export const BASEMAP_IDS = {
  MINIMAL: 'minimal',
  STREETS: 'streets',
  SATELLITE: 'satellite',
} as const;
export type BasemapId = (typeof BASEMAP_IDS)[keyof typeof BASEMAP_IDS];
