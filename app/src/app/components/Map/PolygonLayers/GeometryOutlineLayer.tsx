import type React from 'react';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerIds';
import {sourceLayerProp} from '@/app/constants/map/layerStyle';
import {Layer} from 'react-map-gl/maplibre';
import {FilterSpecification} from 'maplibre-gl';

const GeometryOutlineLayer: React.FC<{
  id: string;
  sourceLayerId?: string;
  filter: FilterSpecification;
  beforeId: string;
  style?: {
    lineWidth?: number;
  };
}> = ({id, sourceLayerId, filter, beforeId, style}) => {
  const lineWidth = style?.lineWidth ?? 1.5;
  return (
    <Layer
      id={id}
      source={BLOCK_SOURCE_ID}
      {...sourceLayerProp(sourceLayerId)}
      filter={filter}
      beforeId={beforeId}
      type="line"
      layout={{
        visibility: 'visible',
      }}
      paint={{
        'line-opacity': 0.8,
        'line-color': [
          'interpolate',
          ['exponential', 1.6],
          ['zoom'],
          6,
          '#aaa',
          9,
          '#777',
          14,
          '#333',
        ],
        'line-width': [
          'interpolate',
          ['exponential', 1.6],
          ['zoom'],
          6,
          lineWidth * 0.125,
          9,
          lineWidth * 0.35,
          14,
          lineWidth,
        ],
      }}
    />
  );
};

export default GeometryOutlineLayer;
