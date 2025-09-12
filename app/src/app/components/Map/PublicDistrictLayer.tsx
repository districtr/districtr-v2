import {
  LABELS_BREAK_LAYER_ID,
  ZONE_ASSIGNMENT_STYLE,
} from '@/app/constants/layers';
import {useMapStore} from '@/app/store/mapStore';
import {Layer, Source} from 'react-map-gl/dist/esm/exports-maplibre';
import {BLOCK_SOURCE_ID} from '@/app/constants/layers';
import {DemographicLayer} from './DemographicLayer';
import {useChoroplethRenderer} from '@/app/hooks/useChoroplethRenderer';

export const PublicDistrictLayer = ({isDemographicMap}: {isDemographicMap?: boolean}) => {
  const getPublicMapData = useMapStore(state => state.getPublicMapData);
  const colorScheme = useMapStore(state => state.colorScheme);
  useChoroplethRenderer();
  const lineWidth = 2;

  return (
    <Source id={BLOCK_SOURCE_ID} type="geojson" data={getPublicMapData()} promoteId="zone">
      {!isDemographicMap && (
        <Layer
          id={'public-districts-layer-line'}
          beforeId={LABELS_BREAK_LAYER_ID}
          type="line"
          layout={{
            visibility: 'visible',
          }}
          paint={{
            'line-opacity': 0.8,
            // 'line-color': '#aaaaaa', // Default color
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
      )}
      {!isDemographicMap && (
        <Layer
          id="public-districts-layer"
          type="fill"
          source="public-districts"
          beforeId={LABELS_BREAK_LAYER_ID}
          paint={{
            'fill-opacity': 0.7,
            'fill-color':
              ZONE_ASSIGNMENT_STYLE(colorScheme, (i: number) => ['==', ['get', 'zone'], i + 1]) ||
              '#000000',
          }}
        />
      )}
      {isDemographicMap && <DemographicLayer />}
    </Source>
  );
};
