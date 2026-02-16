import {BLOCK_SOURCE_ID} from '@/app/constants/layers';
import type {DataDrivenPropertyValueSpecification, FilterSpecification} from 'maplibre-gl';
import {useMemo} from 'react';
import {Layer} from 'react-map-gl/maplibre';

export function GeometryBackgroundLayer({
  id,
  sourceLayerId,
  filter,
  beforeId,
  backgroundOpacity,
}: {
  id: string;
  sourceLayerId: string;
  filter: FilterSpecification;
  beforeId: string;
  backgroundOpacity: number;
}) {
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
      paint={{'fill-opacity': fillOpacity, 'fill-color': '#f00'}}
    />
  );
}
