import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_LAYER_ID,
  BLOCK_LAYER_ID_CHILD,
  BLOCK_SOURCE_ID,
  LABELS_BREAK_LAYER_ID,
  OVERLAY_OPACITY,
} from '@/app/constants/layers';
import { useLayerFilter } from '@/app/hooks/useLayerFilter';
import {useMapStore} from '@/app/store/mapStore';
import {Layer} from 'react-map-gl/maplibre';

export const DemographicLayer: React.FC<{
  child?: boolean;
}> = ({child = false}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const id = child ? mapDocument?.child_layer : mapDocument?.parent_layer;
  const isOverlay = useMapStore(state => state.mapOptions.showDemographicMap) === 'overlay';
  const lineWidth = child ? 1 : 2;
  const layerFilter = useLayerFilter(child);

  if (!id || !mapDocument) return null;
  return (
    <>
      <Layer
        id={`${child ? BLOCK_HOVER_LAYER_ID_CHILD : BLOCK_HOVER_LAYER_ID}${isOverlay ? '_overlay' : ''}`}
        source={BLOCK_SOURCE_ID}
        source-layer={id}
        filter={child ? layerFilter : ['literal', true]}
        beforeId={LABELS_BREAK_LAYER_ID}
        type="fill"
        layout={{
          visibility: 'visible',
        }}
        paint={{
          'fill-opacity': isOverlay ? OVERLAY_OPACITY : 0.9,
          'fill-color': [
            'case',
            ['boolean', ['feature-state', 'hasColor'], false],
            ['feature-state', 'color'],
            '#808080',
          ],
        }}
      />
      {!isOverlay && (
        <Layer
          id={child ? BLOCK_LAYER_ID_CHILD : BLOCK_LAYER_ID}
          source={BLOCK_SOURCE_ID}
          source-layer={id}
          filter={layerFilter}
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
    </>
  );
};
