import {ZONE_ASSIGNMENT_STYLE} from '@/app/constants/map/layerStyle';
import {BLOCK_SOURCE_ID, LABELS_BREAK_LAYER_ID} from '@/app/constants/map/layerIds';
import {useMapStore} from '@/app/store/mapStore';
import {Layer, Source} from 'react-map-gl/maplibre';
import {DemographicLayer} from './DemographicLayer';
import {useChoroplethRenderer} from '@/app/hooks/useChoroplethRenderer';

export const PublicDistrictLayer = ({isDemographicMap}: {isDemographicMap?: boolean}) => {
  const getPublicMapData = useMapStore(state => state.getPublicMapData);
  const colorScheme = useMapStore(state => state.colorScheme);
  useChoroplethRenderer();
  const lineWidth = 2;

  return (
    <Source id={BLOCK_SOURCE_ID} type="geojson" data={getPublicMapData()} promoteId="zone">
      {isDemographicMap ? (
        <DemographicLayer />
      ) : (
        <>
          <Layer
            id={'public-districts-layer-line'}
            beforeId={LABELS_BREAK_LAYER_ID}
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
          <Layer
            id="public-districts-layer"
            type="fill"
            beforeId={LABELS_BREAK_LAYER_ID}
            paint={{
              'fill-opacity': 0.7,
              'fill-color': ZONE_ASSIGNMENT_STYLE(colorScheme) || '#000000',
            }}
          />
        </>
      )}
    </Source>
  );
};
