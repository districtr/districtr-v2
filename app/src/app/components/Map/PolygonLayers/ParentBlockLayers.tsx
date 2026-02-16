'use client';
import type {FilterSpecification} from 'maplibre-gl';
import {BLOCK_HOVER_LAYER_ID} from '@constants/layers';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useLayerFilter} from '@/app/hooks/useLayerFilter';
import GeometryOutlineLayer from './GeometryOutlineLayer';
import {ParentHoverLayerGroup} from './HoverLayerGroup';
import {GeometryBackgroundLayer} from './GeometryBackgroundLayer';
import {DemographicParentLayer} from './DemographicLayer';
import ZoneParentLayerGroup from './ZoneLayers/ZoneParentLayerGroup';

const MAP_LAYER_ORDER = {
  countyLayerBeforeId: 'anchor-counties',
  overlayLayerBeforeId: 'anchor-overlays',
  assignmentLayerBeforeId: 'anchor-assignments',
  demographyLayerBeforeId: 'anchor-demography',
  geometryOutlineLayerBeforeId: 'anchor-geometry-outline',
  hoverLayerBeforeId: 'anchor-hover',
} as const;

const GEOMETRY_OUTLINE_LAYER_IDS = {
  parent: 'blocks-outline',
  child: 'blocks-child-outline',
} as const;

const UNASSIGNED_BACKGROUND_OPACITY = {
  parent: 0.18,
  child: 0.22,
} as const;

export function ParentBlockLayers({layerBeforeId}: {layerBeforeId: string}) {
  const mapDocument = useMapStore(state => state.mapDocument);
  const showDemographicMap = useMapControlsStore(state => state.mapOptions.showDemographicMap);
  const showDemographyOverlay = showDemographicMap === 'overlay';
  const showGeometryBackground = showDemographicMap !== 'overlay';
  const parentAssignmentFilter = ['literal', true] as FilterSpecification;

  if (!mapDocument?.parent_layer) {
    return null;
  }

  return (
    <>
      {showGeometryBackground && (
        <GeometryBackgroundLayer
          id={`${BLOCK_HOVER_LAYER_ID}-background`}
          sourceLayerId={mapDocument.parent_layer}
          filter={parentAssignmentFilter}
          beforeId={BLOCK_HOVER_LAYER_ID}
          backgroundOpacity={UNASSIGNED_BACKGROUND_OPACITY.parent}
        />
      )}

      <ZoneParentLayerGroup layerBeforeId={GEOMETRY_OUTLINE_LAYER_IDS.parent} />
      {showDemographyOverlay && (
        <DemographicParentLayer layerBeforeId={MAP_LAYER_ORDER.demographyLayerBeforeId} />
      )}
      <ParentHoverLayerGroup layerBeforeId={MAP_LAYER_ORDER.hoverLayerBeforeId} />

      <GeometryOutlineLayer
        id={GEOMETRY_OUTLINE_LAYER_IDS.parent}
        lineWidth={2}
        sourceLayerId={mapDocument.parent_layer}
        beforeId={layerBeforeId}
        filter={useLayerFilter(false)}
      />
    </>
  );
}

export function DemographicParentBlockLayers({layerBeforeId}: {layerBeforeId: string}) {
  const mapDocument = useMapStore(state => state.mapDocument);

  if (!mapDocument?.parent_layer) {
    return null;
  }

  return (
    <>
      <DemographicParentLayer layerBeforeId={MAP_LAYER_ORDER.demographyLayerBeforeId} />
      <ParentHoverLayerGroup layerBeforeId={MAP_LAYER_ORDER.hoverLayerBeforeId} />

      <GeometryOutlineLayer
        id={GEOMETRY_OUTLINE_LAYER_IDS.parent}
        lineWidth={2}
        sourceLayerId={mapDocument.parent_layer}
        beforeId={layerBeforeId}
        filter={useLayerFilter(false)}
      />
    </>
  );
}
