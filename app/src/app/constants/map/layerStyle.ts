import {DataDrivenPropertyValueSpecification, ExpressionSpecification} from 'maplibre-gl';
export {FALLBACK_NUM_DISTRICTS, OVERLAY_OPACITY} from './mapDefaults';

export const EMPTY_FT_COLLECTION: GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  GeoJSON.GeoJsonProperties
> = {
  type: 'FeatureCollection',
  features: [],
};

// Sometimes, maplibre requires non-empty arrays for specifications
// This serves as a placeholder for otherwise empty arrays
export const SENTINEL_EMPTY_VALUE: string = '-999';
export const SENTINEL_EMPTY_ARRAY: string[] = [SENTINEL_EMPTY_VALUE];

export const ZONE_ASSIGNMENT_STYLE = (colorScheme: string[]) => {
  const group: Array<unknown> = ['case'];
  colorScheme.forEach((color, i) => {
    group.push(['==', ['feature-state', 'zone'], i + 1], color); // 1-indexed per mapStore.ts
  });
  group.push('#cecece');
  return group as ExpressionSpecification;
};

export const ZONE_LABEL_STYLE = (colorScheme: string[]) => {
  const group: Array<unknown> = ['case'];
  colorScheme.forEach((color, i) => {
    group.push(['==', ['get', 'zone'], i + 1], color); // 1-indexed per mapStore.ts
  });
  group.push('#cecece');
  return group as ExpressionSpecification;
};

export function getLayerFill(
  captiveIds?: Set<string>,
  isDemographic?: boolean
): DataDrivenPropertyValueSpecification<number> {
  const baseOpacity = isDemographic ? 1 : 0.6;
  const hasZoneExpression: ExpressionSpecification = ['boolean', ['feature-state', 'zone'], false];
  const isHoveredExpression: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false];
  const innerFillSpec: DataDrivenPropertyValueSpecification<number> = [
    'case',
    // is broken parent
    ['boolean', ['feature-state', 'broken'], false],
    0,
    // zone is selected and hovered
    ['all', hasZoneExpression, isHoveredExpression],
    baseOpacity + 0.3,
    // zone is selected, fallback, regardless of hover state
    hasZoneExpression,
    baseOpacity + 0.1,
    0,
  ] as DataDrivenPropertyValueSpecification<number>;
  if (captiveIds?.size) {
    const captiveFillSpec: DataDrivenPropertyValueSpecification<number> = [
      'case',
      ['boolean', ['feature-state', 'broken'], false],
      0,
      hasZoneExpression,
      [
        'case',
        ['!', ['in', ['get', 'path'], ['literal', Array.from(captiveIds)]]],
        baseOpacity - 0.25,
        innerFillSpec,
      ],
      0,
    ] as DataDrivenPropertyValueSpecification<number>;
    return captiveFillSpec;
  } else {
    return innerFillSpec;
  }
}
