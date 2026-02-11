import {
  BLOCK_SOURCE_ID,
  COMMUNITY_DRAW_LAYER_ID,
  COMMUNITY_DRAW_LAYER_ID_CHILD,
  COMMUNITY_MIX_LAYER_ID,
  COMMUNITY_MIX_LAYER_ID_CHILD,
  LABELS_BREAK_LAYER_ID,
} from '@/app/constants/layers';
import {useLayerFilter} from '@/app/hooks/useLayerFilter';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useMapStore} from '@/app/store/mapStore';
import {Layer} from 'react-map-gl/maplibre';

export const CommunityLayerGroup = ({
  child = false,
  mode = 'mix',
}: {
  child?: boolean;
  mode?: 'mix' | 'draw';
}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const paintCommunity = useMapControlsStore(state => state.mapOptions.paintCommunity);
  const layerFilter = useLayerFilter(child);
  const layerId = child ? mapDocument?.child_layer : mapDocument?.parent_layer;

  if (!layerId || !mapDocument) return null;

  const drawLayerId = child ? COMMUNITY_DRAW_LAYER_ID_CHILD : COMMUNITY_DRAW_LAYER_ID;
  const mixLayerId = child ? COMMUNITY_MIX_LAYER_ID_CHILD : COMMUNITY_MIX_LAYER_ID;

  if (mode === 'draw') {
    return (
      <Layer
        id={drawLayerId}
        source={BLOCK_SOURCE_ID}
        source-layer={layerId}
        filter={child ? layerFilter : ['literal', true]}
        beforeId={LABELS_BREAK_LAYER_ID}
        type="fill"
        layout={{
          visibility: paintCommunity ? 'visible' : 'none',
        }}
        paint={{
          'fill-opacity': 0.9,
          'fill-color': ['coalesce', ['feature-state', 'community_draw'], 'rgba(0,0,0,0)'],
        }}
      />
    );
  }
  return (
    <Layer
      id={mixLayerId}
      source={BLOCK_SOURCE_ID}
      source-layer={layerId}
      filter={child ? layerFilter : ['literal', true]}
      beforeId={LABELS_BREAK_LAYER_ID}
      type="fill"
      layout={{
        visibility: 'visible',
      }}
      paint={{
        'fill-opacity': 1,
        'fill-color': ['coalesce', ['feature-state', 'community_mix'], 'rgba(0,0,0,0)'],
      }}
    />
  );
};
