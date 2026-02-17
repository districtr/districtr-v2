import type React from 'react';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerIds';
import type {FilterSpecification} from 'maplibre-gl';
import {Layer} from 'react-map-gl/maplibre';

export const GeometryBackgroundLayer: React.FC<{
  id: string;
  sourceLayerId: string;
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
      source-layer={sourceLayerId}
      filter={filter}
      beforeId={beforeId}
      type="fill"
      layout={{visibility: 'visible'}}
      paint={{
        'fill-opacity': [
          'case',
          // Coalesce to -999 since none of our features will ever be assigned to that
          ['!=', ['coalesce', ['feature-state', 'zone'], -999], -999],
          0,
          backgroundOpacity,
        ],
        'fill-color': '#cecece',
      }}
    />
  );
};
