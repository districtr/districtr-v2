import type React from 'react';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerStyle';
import type {DataDrivenPropertyValueSpecification, FilterSpecification} from 'maplibre-gl';
import {useMemo} from 'react';
import {Layer} from 'react-map-gl/maplibre';

export const GeometryBackgroundLayer: React.FC<{
  id: string;
  sourceLayerId: string;
  filter: FilterSpecification;
  beforeId: string;
  style?: {
    backgroundOpacity?: number;
  };
}> = ({
  id,
  sourceLayerId,
  filter,
  beforeId,
  style,
}) => {
  const backgroundOpacity = style?.backgroundOpacity ?? 0.2;

  const fillOpacity = useMemo(
    () =>
      [
        'case',
        // Hide background anywhere an assignment exists.
        ['!', ['==', ['feature-state', 'zone'], null]],
        0,
        backgroundOpacity,
      ] as unknown as DataDrivenPropertyValueSpecification<number>,
    [backgroundOpacity]
  );

  return (
    <Layer
      id={id}
      source={BLOCK_SOURCE_ID}
      source-layer={sourceLayerId}
      filter={filter}
      beforeId={beforeId}
      type="fill"
      layout={{visibility: 'visible'}}
      paint={{'fill-opacity': fillOpacity, 'fill-color': '#cecece'}}
    />
  );
};
