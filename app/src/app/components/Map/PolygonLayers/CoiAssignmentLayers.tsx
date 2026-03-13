'use client';
import type React from 'react';
import type {FilterSpecification} from 'maplibre-gl';
import {CANONICAL_LAYER_IDS, BlockScope} from '@constants/map/layerIds';
import {HIDE_ALL_FILTER} from '@/app/constants/map/layerFilters';
import {CoiAssignmentLayer} from './CoiAssignmentLayer';
import type {Community} from '@/app/utils/api/apiHandlers/types';

const getCommunityLayerId = (scope: BlockScope, communityId: number) =>
  `${CANONICAL_LAYER_IDS.BLOCK[scope].HOVER}-community-${communityId}`;

type CoiAssignmentLayersProps = {
  communityVisibility: Map<number, boolean>;
  sourceLayerId: string;
  selectedOnTopThenRenderOrderCommunities: Community[];
  scope: BlockScope;
  layerFilter: FilterSpecification;
};

export const CoiAssignmentLayers: React.FC<CoiAssignmentLayersProps> = ({
  communityVisibility,
  sourceLayerId,
  selectedOnTopThenRenderOrderCommunities,
  scope,
  layerFilter,
}) => (
  <>
    {selectedOnTopThenRenderOrderCommunities.map((community, index) => {
      const isVisible = communityVisibility.get(community.id) ?? true;
      const newfilter = isVisible ? layerFilter : HIDE_ALL_FILTER;
      const aboveLayerId =
        index === 0
          ? CANONICAL_LAYER_IDS.BLOCK[scope].HIGHLIGHT
          : getCommunityLayerId(scope, selectedOnTopThenRenderOrderCommunities[index - 1].id);
      return (
        <CoiAssignmentLayer
          key={`${scope}-community-layer-${community.id}`}
          id={getCommunityLayerId(scope, community.id)}
          membershipKey={`community_${community.id}`}
          color={community.color}
          sourceLayerId={sourceLayerId}
          filter={newfilter}
          beforeId={aboveLayerId}
        />
      );
    })}
  </>
);
