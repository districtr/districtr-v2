'use client';
import type React from 'react';
import type {ExpressionSpecification} from 'maplibre-gl';
import {Layer} from 'react-map-gl/maplibre';
import {CANONICAL_LAYER_IDS, PUBLIC_SOURCE_ID} from '@constants/map/layerIds';
import {
  OVERLAY_OPACITY,
  ZONE_LABEL_STYLE,
  HIGHLIGHT_LINE_COLOR,
  HIGHLIGHT_LINE_WIDTH,
  HIGHLIGHT_MASK_COLOR,
  HIGHLIGHT_MASK_OPACITY,
} from '@constants/map/layerStyle';
import {DEFAULT_BLOCK_LAYER_ORDER} from '@constants/map/layerRenderConfig';
import {useColorScheme} from '@/app/hooks/useColorScheme';
import {useMapStore} from '@store/mapStore';

export const PublicDistrictLayers: React.FC = () => {
  const colorScheme = useColorScheme();
  // The highlight is drawn from the store's list alone, so the map can show no
  // highlight that the list does not hold. A feature's `path` is its district.
  const hoveredZones = useMapStore(state => state.hoveredPublicZones);
  const isHighlighted: ExpressionSpecification = ['in', ['get', 'path'], ['literal', hoveredZones]];

  return (
    <>
      <Layer
        id={CANONICAL_LAYER_IDS.PUBLIC.FILL}
        source={PUBLIC_SOURCE_ID}
        type="fill"
        paint={{
          'fill-color': ZONE_LABEL_STYLE(colorScheme),
          'fill-opacity': OVERLAY_OPACITY,
        }}
        beforeId={DEFAULT_BLOCK_LAYER_ORDER.zoneBeforeId}
      />
      <Layer
        id={CANONICAL_LAYER_IDS.PUBLIC.OUTLINE}
        source={PUBLIC_SOURCE_ID}
        type="line"
        paint={{
          'line-color': '#555',
          'line-width': 1.5,
        }}
        beforeId={DEFAULT_BLOCK_LAYER_ORDER.outlineBeforeId}
      />
      {hoveredZones.length > 0 && (
        <Layer
          id={CANONICAL_LAYER_IDS.PUBLIC.MASK}
          source={PUBLIC_SOURCE_ID}
          type="fill"
          paint={{
            'fill-color': HIGHLIGHT_MASK_COLOR,
            'fill-opacity': ['case', isHighlighted, 0, HIGHLIGHT_MASK_OPACITY],
          }}
          beforeId={DEFAULT_BLOCK_LAYER_ORDER.highlightBeforeId}
        />
      )}
      <Layer
        id={CANONICAL_LAYER_IDS.PUBLIC.HIGHLIGHT}
        source={PUBLIC_SOURCE_ID}
        type="line"
        paint={{
          'line-color': HIGHLIGHT_LINE_COLOR,
          'line-width': ['case', isHighlighted, HIGHLIGHT_LINE_WIDTH, 0],
        }}
        beforeId={DEFAULT_BLOCK_LAYER_ORDER.highlightBeforeId}
      />
    </>
  );
};
