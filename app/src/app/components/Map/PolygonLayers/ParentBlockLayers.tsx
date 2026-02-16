'use client';
import type {FilterSpecification} from 'maplibre-gl';
import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_LAYER_ID_HIGHLIGHT,
} from '@constants/layers';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useLayerFilter} from '@/app/hooks/useLayerFilter';
import GeometryOutlineLayer from './GeometryOutlineLayer';
import {HoverLayerGroup} from './HoverLayerGroup';
import {GeometryBackgroundLayer} from './GeometryBackgroundLayer';
import {DemographicLayer} from './DemographicLayer';
import {ZoneLayerGroup} from './ZoneLayers/ZoneLayerGroup';

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
  const parentLayerFilter = ['literal', true] as FilterSpecification;
  const parentOutlineFilter = useLayerFilter(false);
  const showGeometryBackground = showDemographicMap !== 'overlay';

  if (!mapDocument?.parent_layer) {
    return null;
  }
  const parentSourceLayerId = mapDocument.parent_layer;

  return (
    <>
      {showGeometryBackground && (
        <GeometryBackgroundLayer
          id={`${BLOCK_HOVER_LAYER_ID}-background`}
          sourceLayerId={parentSourceLayerId}
          filter={parentLayerFilter}
          beforeId={MAP_LAYER_ORDER.assignmentLayerBeforeId}
          style={{
            backgroundOpacity: UNASSIGNED_BACKGROUND_OPACITY.parent,
          }}
        />
      )}

      <ZoneLayerGroup
        ids={{
          highlightId: BLOCK_LAYER_ID_HIGHLIGHT,
          assignmentId: BLOCK_HOVER_LAYER_ID,
        }}
        sourceLayerId={parentSourceLayerId}
        filter={parentLayerFilter}
        layerBeforeId={GEOMETRY_OUTLINE_LAYER_IDS.parent}
      />
      {showDemographyOverlay && (
        <DemographicLayer
          idBase={BLOCK_HOVER_LAYER_ID}
          sourceLayerId={parentSourceLayerId}
          filter={parentLayerFilter}
          layerBeforeId={MAP_LAYER_ORDER.demographyLayerBeforeId}
        />
      )}
      <HoverLayerGroup
        idBase={BLOCK_HOVER_LAYER_ID}
        sourceLayerId={parentSourceLayerId}
        filter={parentLayerFilter}
        layerBeforeId={MAP_LAYER_ORDER.hoverLayerBeforeId}
      />

      <GeometryOutlineLayer
        id={GEOMETRY_OUTLINE_LAYER_IDS.parent}
        sourceLayerId={parentSourceLayerId}
        filter={parentOutlineFilter}
        beforeId={layerBeforeId}
        style={{lineWidth: 2}}
      />
    </>
  );
}

export function DemographicParentBlockLayers({layerBeforeId}: {layerBeforeId: string}) {
  const mapDocument = useMapStore(state => state.mapDocument);
  const parentLayerFilter = ['literal', true] as FilterSpecification;
  const parentOutlineFilter = useLayerFilter(false);

  if (!mapDocument?.parent_layer) {
    return null;
  }
  const parentSourceLayerId = mapDocument.parent_layer;

  return (
    <>
      <DemographicLayer
        idBase={BLOCK_HOVER_LAYER_ID}
        sourceLayerId={parentSourceLayerId}
        filter={parentLayerFilter}
        layerBeforeId={MAP_LAYER_ORDER.demographyLayerBeforeId}
      />
      <HoverLayerGroup
        idBase={BLOCK_HOVER_LAYER_ID}
        sourceLayerId={parentSourceLayerId}
        filter={parentLayerFilter}
        layerBeforeId={MAP_LAYER_ORDER.hoverLayerBeforeId}
      />

      <GeometryOutlineLayer
        id={GEOMETRY_OUTLINE_LAYER_IDS.parent}
        sourceLayerId={parentSourceLayerId}
        filter={parentOutlineFilter}
        beforeId={layerBeforeId}
        style={{lineWidth: 2}}
      />
    </>
  );
}
