'use client';
import type React from 'react';
import type {FilterSpecification} from 'maplibre-gl';
import {Layer} from 'react-map-gl/maplibre';
import {BLOCK_SOURCE_ID, CANONICAL_LAYER_IDS, BlockScope} from '@constants/map/layerIds';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useMapStore} from '@/app/store/mapStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {sortCommunitiesByRenderOrder} from '@/app/utils/communities';
import GeometryOutlineLayer from './GeometryOutlineLayer';
import {HoverLayerGroup} from './HoverLayerGroup';
import {GeometryBackgroundLayer} from './GeometryBackgroundLayer';
import {DemographicLayer} from './DemographicLayer';
import {
  UNASSIGNED_BACKGROUND_OPACITY,
  DEFAULT_BLOCK_LAYER_ORDER,
} from '@constants/map/layerRenderConfig';
import {ZoneHighlightLayer} from './ZoneLayers/ZoneHighlightLayer';
import {CoiAssignmentLayers} from './CoiAssignmentLayers';

export const CoiBlockLayers: React.FC<{
  scope: BlockScope;
  layerFilter: FilterSpecification;
  outlineFilter: FilterSpecification;
  sourceLayerId: string;
}> = ({scope, layerFilter, outlineFilter, sourceLayerId}) => {
  const showDemographicMap = useMapControlsStore(state => state.mapOptions.demographicDisplayMode);
  const selectedCommunity = useMapControlsStore(state => state.selectedZone);
  const communities = useMapStore(state => state.communities);
  const communityVisibility = useCoiAssignmentsStore(state => state.communityVisibility);
  const showDemographyOverlay = showDemographicMap === 'overlay';
  const showGeometryBackground = showDemographicMap !== 'overlay';
  const lineWidth = scope === 'CHILD' ? 1 : 2;
  const backgroundOpacity =
    scope === 'CHILD' ? UNASSIGNED_BACKGROUND_OPACITY.child : UNASSIGNED_BACKGROUND_OPACITY.parent;
  const allCommunities = sortCommunitiesByRenderOrder(communities);
  const visibleMembershipKeys = allCommunities
    .filter(community => communityVisibility.get(community.id) ?? true)
    .map(community => `community_${community.id}`);
  const reversedCommunities = [...allCommunities].reverse();
  const selectedCommunityExists = allCommunities.some(
    community => community.id === selectedCommunity
  );
  const selectedOnTopThenRenderOrderCommunities = selectedCommunityExists
    ? [
        allCommunities.find(community => community.id === selectedCommunity)!,
        ...reversedCommunities.filter(community => community.id !== selectedCommunity),
      ]
    : reversedCommunities;

  return (
    <>
      {showGeometryBackground && (
        <GeometryBackgroundLayer
          id={CANONICAL_LAYER_IDS.BLOCK[scope].BACKGROUND}
          sourceLayerId={sourceLayerId}
          filter={layerFilter}
          beforeId={DEFAULT_BLOCK_LAYER_ORDER.backgroundBeforeId}
          visibleMembershipKeys={visibleMembershipKeys}
          style={{
            backgroundOpacity,
          }}
        />
      )}

      <ZoneHighlightLayer
        id={CANONICAL_LAYER_IDS.BLOCK[scope].HIGHLIGHT}
        sourceLayerId={sourceLayerId}
        filter={layerFilter}
        beforeId={DEFAULT_BLOCK_LAYER_ORDER.zoneBeforeId}
      />
      <Layer
        id={CANONICAL_LAYER_IDS.BLOCK[scope].HOVER}
        source={BLOCK_SOURCE_ID}
        source-layer={sourceLayerId}
        filter={layerFilter}
        beforeId={CANONICAL_LAYER_IDS.BLOCK[scope].HIGHLIGHT}
        type="fill"
        layout={{visibility: 'visible'}}
        paint={{
          // Keep a canonical interactive layer for brush hit-testing.
          'fill-opacity': 0.001,
          // Must stay visually transparent because shared map subscriptions mutate this layer opacity.
          'fill-color': 'rgba(0,0,0,0)',
        }}
      />
      <CoiAssignmentLayers
        communityVisibility={communityVisibility}
        sourceLayerId={sourceLayerId}
        selectedOnTopThenRenderOrderCommunities={selectedOnTopThenRenderOrderCommunities}
        scope={scope}
        layerFilter={layerFilter}
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
