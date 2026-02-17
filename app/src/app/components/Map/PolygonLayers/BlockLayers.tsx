'use client';
import type React from 'react';
import type {FilterSpecification} from 'maplibre-gl';
import {CANONICAL_LAYER_IDS, BlockScope} from '@constants/map/layerIds';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import GeometryOutlineLayer from './GeometryOutlineLayer';
import {HoverLayerGroup} from './HoverLayerGroup';
import {GeometryBackgroundLayer} from './GeometryBackgroundLayer';
import {DemographicLayer} from './DemographicLayer';
import {
  UNASSIGNED_BACKGROUND_OPACITY,
  DEFAULT_BLOCK_LAYER_ORDER,
} from '@constants/map/layerRenderConfig';
import {ZoneLayerGroup} from './ZoneLayers/ZoneLayerGroup';

export const BlockLayers: React.FC<{
  scope: BlockScope;
  layerFilter: FilterSpecification;
  outlineFilter: FilterSpecification;
  sourceLayerId: string;
}> = ({scope, layerFilter, outlineFilter, sourceLayerId}) => {
  const showDemographicMap = useMapControlsStore(state => state.mapOptions.showDemographicMap);
  const showDemographyOverlay = showDemographicMap === 'overlay';
  const showGeometryBackground = showDemographicMap !== 'overlay';
  const lineWidth = scope === 'CHILD' ? 1 : 2;
  const backgroundOpacity =
    scope === 'CHILD' ? UNASSIGNED_BACKGROUND_OPACITY.child : UNASSIGNED_BACKGROUND_OPACITY.parent;

  return (
    <>
      {showGeometryBackground && (
        <GeometryBackgroundLayer
          id={CANONICAL_LAYER_IDS.BLOCK[scope].BACKGROUND}
          sourceLayerId={sourceLayerId}
          filter={layerFilter}
          beforeId={DEFAULT_BLOCK_LAYER_ORDER.backgroundBeforeId}
          style={{
            backgroundOpacity,
          }}
        />
      )}

      <ZoneLayerGroup
        ids={{
          highlightId: CANONICAL_LAYER_IDS.BLOCK[scope].HIGHLIGHT,
          assignmentId: CANONICAL_LAYER_IDS.BLOCK[scope].HOVER,
        }}
        sourceLayerId={sourceLayerId}
        filter={layerFilter}
        layerBeforeId={DEFAULT_BLOCK_LAYER_ORDER.zoneBeforeId}
      />
      {showDemographyOverlay && (
        <DemographicLayer
          idBase={CANONICAL_LAYER_IDS.BLOCK[scope].HOVER}
          sourceLayerId={sourceLayerId}
          filter={layerFilter}
          layerBeforeId={DEFAULT_BLOCK_LAYER_ORDER.demographyBeforeId}
        />
      )}
      <HoverLayerGroup
        idBase={CANONICAL_LAYER_IDS.BLOCK[scope].HOVER}
        sourceLayerId={sourceLayerId}
        filter={layerFilter}
        layerBeforeId={DEFAULT_BLOCK_LAYER_ORDER.hoverBeforeId}
      />

      <GeometryOutlineLayer
        id={CANONICAL_LAYER_IDS.BLOCK[scope].OUTLINE}
        sourceLayerId={sourceLayerId}
        filter={outlineFilter}
        beforeId={DEFAULT_BLOCK_LAYER_ORDER.outlineBeforeId}
        style={{lineWidth}}
      />
    </>
  );
};
