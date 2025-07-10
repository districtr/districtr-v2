import {
  BLOCK_POINTS_LAYER_ID,
  BLOCK_POINTS_LAYER_ID_CHILD,
  EMPTY_FT_COLLECTION,
} from '@/app/constants/layers';
import {useLayerFilter} from '@/app/hooks/useLayerFilter';
import React from 'react';
import {Layer, Source} from 'react-map-gl/maplibre';
import {usePointData} from '@/app/hooks/usePointData';
import {useFeatureFlags} from '@/app/hooks/useFeatureFlags';

export const PointSelectionLayer: React.FC<{child?: boolean}> = ({child = false}) => {
  const data = usePointData(child);
  const layerFilter = useLayerFilter(child);
  const sourceID = 'SELECTION_POINTS' + (child ? '_child' : '');
  const {debugSelectionPoints} = useFeatureFlags();
  return (
    <Source
      id={sourceID}
      type="geojson"
      promoteId="path"
      data={data.current || EMPTY_FT_COLLECTION}
    >
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
    </Source>
  );
};
