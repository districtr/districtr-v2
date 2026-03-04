'use client';
import type React from 'react';
import type {FilterSpecification} from 'maplibre-gl';
import {BlockScope} from '@/app/constants/map/layerIds';
import {BlockLayers} from './PolygonLayers/BlockLayers';

export const PublicDistrictLayer: React.FC<{
  scope: BlockScope;
  layerFilter: FilterSpecification;
  outlineFilter: FilterSpecification;
  sourceLayerId?: string;
}> = ({scope, layerFilter, outlineFilter, sourceLayerId}) => {
  return (
    <BlockLayers
      scope={scope}
      layerFilter={layerFilter}
      outlineFilter={outlineFilter}
      sourceLayerId={sourceLayerId}
    />
  );
};
