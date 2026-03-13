'use client';
import type React from 'react';
import {Layer} from 'react-map-gl/maplibre';
import {CANONICAL_LAYER_IDS, PUBLIC_SOURCE_ID} from '@constants/map/layerIds';
import {ZONE_LABEL_STYLE} from '@constants/map/layerStyle';
import {DEFAULT_BLOCK_LAYER_ORDER} from '@constants/map/layerRenderConfig';
import {useColorScheme} from '@/app/hooks/useColorScheme';

export const PublicDistrictLayers: React.FC = () => {
  const colorScheme = useColorScheme();

  return (
    <>
      <Layer
        id={CANONICAL_LAYER_IDS.PUBLIC.FILL}
        source={PUBLIC_SOURCE_ID}
        type="fill"
        paint={{
          'fill-color': ZONE_LABEL_STYLE(colorScheme),
          'fill-opacity': 0.7,
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
    </>
  );
};
