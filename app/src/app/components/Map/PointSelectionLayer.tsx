import {
  BLOCK_POINTS_LAYER_ID,
  BLOCK_POINTS_LAYER_ID_CHILD,
  SELECTION_POINTS_SOURCE_ID,
  SELECTION_POINTS_SOURCE_ID_CHILD,
} from '@/app/constants/layers';
import {useLayerFilter} from '@/app/hooks/useLayerFilter';
import React from 'react';
import {Layer} from 'react-map-gl/maplibre';
import {useFeatureFlags} from '@/app/hooks/useFeatureFlags';

export const PointSelectionLayer: React.FC<{child?: boolean}> = ({child = false}) => {
  const layerFilter = useLayerFilter(child);
  const sourceID = child ? SELECTION_POINTS_SOURCE_ID_CHILD : SELECTION_POINTS_SOURCE_ID;
  const {debugSelectionPoints} = useFeatureFlags();
  return (
    <Layer
      id={child ? BLOCK_POINTS_LAYER_ID_CHILD : BLOCK_POINTS_LAYER_ID}
      source={sourceID}
      filter={layerFilter}
      type="circle"
      layout={{
        visibility: 'visible',
      }}
      paint={{
        'circle-radius': debugSelectionPoints ? 2 : 0,
        'circle-color': 'red',
      }}
    />
  );
};
