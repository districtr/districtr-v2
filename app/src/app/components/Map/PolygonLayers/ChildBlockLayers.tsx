'use client';
import type React from 'react';
import {
  GEOMETRY_OUTLINE_LAYER_IDS,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_LAYER_ID_HIGHLIGHT_CHILD,
} from '@constants/map/layerIds';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useLayerFilter} from '@/app/hooks/useLayerFilter';
import GeometryOutlineLayer from './GeometryOutlineLayer';
import {GeometryBackgroundLayer} from './GeometryBackgroundLayer';
import {ZoneLayerGroup} from './ZoneLayers/ZoneLayerGroup';
import {HoverLayerGroup} from './HoverLayerGroup';
import {UNASSIGNED_BACKGROUND_OPACITY, type BlockLayerOrder} from '@constants/map/layerRenderConfig';
import {DemographicLayer} from './DemographicLayer';

export const ChildBlockLayers: React.FC<{layerOrder: BlockLayerOrder}> = ({layerOrder}) => {
  const childLayerFilter = useLayerFilter(true);
  const mapDocument = useMapStore(state => state.mapDocument);
  const showDemographicMap = useMapControlsStore(state => state.mapOptions.showDemographicMap);
  const showDemographyOverlay = showDemographicMap === 'overlay';
  const showGeometryBackground = showDemographicMap !== 'overlay';

  if (!mapDocument?.child_layer) {
    return null;
  }
  const childSourceLayerId = mapDocument.child_layer;

  return (
    <>
      {showGeometryBackground && (
        <GeometryBackgroundLayer
          id={`${BLOCK_HOVER_LAYER_ID_CHILD}-background`}
          sourceLayerId={childSourceLayerId}
          filter={childLayerFilter}
          beforeId={layerOrder.backgroundBeforeId}
          style={{
            backgroundOpacity: UNASSIGNED_BACKGROUND_OPACITY.child,
          }}
        />
      )}
      <ZoneLayerGroup
        ids={{
          highlightId: BLOCK_LAYER_ID_HIGHLIGHT_CHILD,
          assignmentId: BLOCK_HOVER_LAYER_ID_CHILD,
        }}
        sourceLayerId={childSourceLayerId}
        filter={childLayerFilter}
        layerBeforeId={layerOrder.zoneBeforeId}
      />
      {showDemographyOverlay && (
        <DemographicLayer
          idBase={BLOCK_HOVER_LAYER_ID_CHILD}
          sourceLayerId={childSourceLayerId}
          filter={childLayerFilter}
          layerBeforeId={layerOrder.demographyBeforeId}
        />
      )}
      <HoverLayerGroup
        idBase={BLOCK_HOVER_LAYER_ID_CHILD}
        sourceLayerId={childSourceLayerId}
        filter={childLayerFilter}
        layerBeforeId={layerOrder.hoverBeforeId}
      />
      <GeometryOutlineLayer
        id={GEOMETRY_OUTLINE_LAYER_IDS.child}
        sourceLayerId={childSourceLayerId}
        filter={childLayerFilter}
        beforeId={layerOrder.outlineBeforeId}
        style={{lineWidth: 1}}
      />
    </>
  );
};

export const DemographicChildBlockLayers: React.FC<{layerOrder: BlockLayerOrder}> = ({
  layerOrder,
}) => {
  const childLayerFilter = useLayerFilter(true);
  const mapDocument = useMapStore(state => state.mapDocument);

  if (!mapDocument?.child_layer) {
    return null;
  }
  const childSourceLayerId = mapDocument.child_layer;

  return (
    <>
      <DemographicLayer
        idBase={BLOCK_HOVER_LAYER_ID_CHILD}
        sourceLayerId={childSourceLayerId}
        filter={childLayerFilter}
        layerBeforeId={layerOrder.demographyBeforeId}
      />
      <HoverLayerGroup
        idBase={BLOCK_HOVER_LAYER_ID_CHILD}
        sourceLayerId={childSourceLayerId}
        filter={childLayerFilter}
        layerBeforeId={layerOrder.hoverBeforeId}
      />
      <GeometryOutlineLayer
        id={GEOMETRY_OUTLINE_LAYER_IDS.child}
        sourceLayerId={childSourceLayerId}
        filter={childLayerFilter}
        beforeId={layerOrder.outlineBeforeId}
        style={{lineWidth: 1}}
      />
    </>
  );
};
