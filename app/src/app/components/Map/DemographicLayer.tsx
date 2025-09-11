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
import {useMemo} from 'react';
import {Layer, LayerProps} from 'react-map-gl/maplibre';

export const DemographicLayer: React.FC<{
  child?: boolean;
}> = ({child = false}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const isPublic = mapDocument?.document_id === 'anonymous';
  const id = child ? mapDocument?.child_layer : mapDocument?.parent_layer;
  const isOverlay = useMapStore(state => state.mapOptions.showDemographicMap) === 'overlay';
  const overlayOpacity = useMapStore(state => state.mapOptions.overlayOpacity);
  const lineWidth = child ? 1 : 2;
  const layerFilter = useLayerFilter(child);

  if (!id || !mapDocument) return null;

  const layerProps = useMemo(() => {
    const overlayLayerProps: LayerProps = {
      id: `${child ? BLOCK_HOVER_LAYER_ID_CHILD : BLOCK_HOVER_LAYER_ID}${isOverlay ? '_overlay' : ''}`,
      source: BLOCK_SOURCE_ID,
      filter: child ? layerFilter : ['literal', true],
      beforeId: LABELS_BREAK_LAYER_ID,
      type: 'fill',
      layout: {
        visibility: 'visible',
      },
      paint: {
        'fill-opacity': isOverlay ? overlayOpacity : 0.9,
        'fill-color': [
          'case',
          ['boolean', ['feature-state', 'hasColor'], false],
          ['feature-state', 'color'],
          '#808080',
        ],
      },
    };
    const lineLayerProps: LayerProps = {
      id: child ? BLOCK_LAYER_ID_CHILD : BLOCK_LAYER_ID,
      source: BLOCK_SOURCE_ID,
      filter: layerFilter,
      beforeId: LABELS_BREAK_LAYER_ID,
      type: 'line',
      layout: {
        visibility: 'visible',
      },
      paint: {
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
      },
    };
    if (!isPublic) {
      lineLayerProps['source-layer'] = id;
      overlayLayerProps['source-layer'] = id;
    }

    return {
      overlayLayerProps,
      lineLayerProps,
    };
  }, [child, isOverlay, isPublic, id, layerFilter, overlayOpacity]);
  return (
    <>
      <Layer {...layerProps.overlayLayerProps} />
      {!isOverlay && <Layer {...layerProps.lineLayerProps} />}
    </>
  );
};
