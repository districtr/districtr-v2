import type React from 'react';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerIds';
import type {FilterSpecification} from 'maplibre-gl';
import {Layer} from 'react-map-gl/maplibre';
import {SENTINEL_EMPTY_VALUE} from '@/app/constants/map/layerStyle';

export const GeometryBackgroundLayer: React.FC<{
  id: string;
  sourceLayerId?: string;
  filter: FilterSpecification;
  beforeId: string;
  style?: {
    backgroundOpacity?: number;
  };
}> = ({id, sourceLayerId, filter, beforeId, style}) => {
  const backgroundOpacity = style?.backgroundOpacity ?? 0.2;

  return (
    <Layer
      id={id}
      source={BLOCK_SOURCE_ID}
      {...(sourceLayerId ? {'source-layer': sourceLayerId} : {})}
      filter={filter}
      beforeId={beforeId}
      type="fill"
      layout={{visibility: 'visible'}}
      paint={{
        'fill-opacity': [
          'case',
          [
            '!=',
            ['coalesce', ['feature-state', 'zone'], SENTINEL_EMPTY_VALUE],
            SENTINEL_EMPTY_VALUE,
          ],
          0,
          backgroundOpacity,
        ],
        'fill-color': '#cecece',
      }}
    />
  );
};
