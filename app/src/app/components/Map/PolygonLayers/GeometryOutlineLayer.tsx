import {BLOCK_SOURCE_ID} from '@/app/constants/layers';
import {Layer} from 'react-map-gl/maplibre';
import {FilterSpecification} from 'maplibre-gl';

export default function GeometryOutlineLayer({
  id,
  lineWidth,
  sourceLayerId,
  beforeId,
  filter,
}: {
  id: string;
  lineWidth: number;
  sourceLayerId?: string | null;
  beforeId: string;
  filter: FilterSpecification;
}) {
  if (!sourceLayerId) return null;
  return (
    <Layer
      id={id}
      source={BLOCK_SOURCE_ID}
      source-layer={sourceLayerId}
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
}
