'use client';
import type React from 'react';
import type {FilterSpecification} from 'maplibre-gl';
import {CANONICAL_LAYER_IDS, BlockScope} from '@constants/map/layerIds';
import GeometryOutlineLayer from './GeometryOutlineLayer';
import {HoverLayerGroup} from './HoverLayerGroup';
import {DemographicLayer} from './DemographicLayer';
import {DEFAULT_BLOCK_LAYER_ORDER} from '@constants/map/layerRenderConfig';

export const BlockDemographicLayers: React.FC<{
  scope: BlockScope;
  layerFilter: FilterSpecification;
  outlineFilter: FilterSpecification;
  sourceLayerId: string;
}> = ({scope, layerFilter, outlineFilter, sourceLayerId}) => {
  const lineWidth = scope === 'CHILD' ? 1 : 2;

  return (
    <>
      <DemographicLayer
        idBase={CANONICAL_LAYER_IDS.BLOCK[scope].HOVER}
        sourceLayerId={sourceLayerId}
        filter={layerFilter}
        layerBeforeId={DEFAULT_BLOCK_LAYER_ORDER.demographyBeforeId}
      />
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
