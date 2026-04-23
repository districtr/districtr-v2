import type React from 'react';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerIds';
import type {ExpressionSpecification, FilterSpecification} from 'maplibre-gl';
import {Layer, LayerProps} from 'react-map-gl/maplibre';
import {SENTINEL_EMPTY_VALUE} from '@/app/constants/map/layerStyle';

export const GeometryBackgroundLayer: React.FC<{
  id: string;
  sourceLayerId?: string;
  filter: FilterSpecification;
  beforeId: string;
  style?: {
    backgroundOpacity?: number;
  };
  visibleMembershipKeys?: string[];
}> = ({id, sourceLayerId, filter, beforeId, style, visibleMembershipKeys}) => {
  const backgroundOpacity = style?.backgroundOpacity ?? 0.2;
  const hideWhenAssignedExpression = (visibleMembershipKeys?.length
    ? [
        'any',
        ...visibleMembershipKeys.map(membershipKey => [
          'boolean',
          ['feature-state', membershipKey],
          false,
        ]),
      ]
    : [
        '!=',
        ['coalesce', ['feature-state', 'zone'], SENTINEL_EMPTY_VALUE],
        SENTINEL_EMPTY_VALUE,
      ]) as unknown as ExpressionSpecification;

  const layerProps: LayerProps = {
    id,
    source: BLOCK_SOURCE_ID,
    'source-layer': sourceLayerId,
    filter,
    beforeId,
    type: 'fill',
    layout: {visibility: 'visible'},
    paint: {
      'fill-opacity': ['case', hideWhenAssignedExpression, 0, backgroundOpacity],
      'fill-color': '#cecece',
    },
  };
  return <Layer {...layerProps} />;
};
