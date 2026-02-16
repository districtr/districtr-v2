import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_LAYER_ID,
  BLOCK_LAYER_ID_CHILD,
  BLOCK_SOURCE_ID,
  LABELS_BREAK_LAYER_ID,
} from '@/app/constants/layers';
import {useLayerFilter} from '@/app/hooks/useLayerFilter';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {Layer} from 'react-map-gl/maplibre';

export function DemographicLayer({
  child = false,
  layerBeforeId,
}: {
  child?: boolean;
  layerBeforeId: string;
}) {
  const mapDocument = useMapStore(state => state.mapDocument);
  const id = child ? mapDocument?.child_layer : mapDocument?.parent_layer;
  const isOverlay = useMapControlsStore(state => state.mapOptions.showDemographicMap) === 'overlay';
  const overlayOpacity = useMapControlsStore(state => state.mapOptions.overlayOpacity);
  const lineWidth = child ? 1 : 2;
  const layerFilter = useLayerFilter(child);
  const fillId = `${child ? BLOCK_HOVER_LAYER_ID_CHILD : BLOCK_HOVER_LAYER_ID}${isOverlay ? '_overlay' : ''}`;
  const lineId = child ? BLOCK_LAYER_ID_CHILD : BLOCK_LAYER_ID;

  if (!id || !mapDocument) return null;
  return (
    <>
      {!isOverlay && (
        <Layer
          id={lineId}
          source={BLOCK_SOURCE_ID}
          source-layer={id}
          filter={layerFilter}
          beforeId={layerBeforeId}
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
      <Layer
        id={fillId}
        source={BLOCK_SOURCE_ID}
        source-layer={id}
        filter={child ? layerFilter : ['literal', true]}
        beforeId={!isOverlay ? lineId : layerBeforeId}
        type="fill"
        layout={{
          visibility: 'visible',
        }}
        paint={{
          'fill-opacity': isOverlay ? overlayOpacity : 0.9,
          'fill-color': [
            'case',
            ['boolean', ['feature-state', 'hasColor'], false],
            ['feature-state', 'color'],
            '#808080',
          ],
        }}
      />
    </>
  );
}
