'use client';
import {
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_LAYER_ID_HIGHLIGHT_CHILD,
} from '@constants/layers';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useLayerFilter} from '@/app/hooks/useLayerFilter';
import GeometryOutlineLayer from './GeometryOutlineLayer';
import {GeometryBackgroundLayer} from './GeometryBackgroundLayer';
import {ZoneLayerGroup} from './ZoneLayers/ZoneLayerGroup';
import {HoverLayerGroup} from './HoverLayerGroup';
import {DemographicLayer} from './DemographicLayer';

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

export function ChildBlockLayers({layerBeforeId}: {layerBeforeId: string}) {
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
          beforeId={MAP_LAYER_ORDER.assignmentLayerBeforeId}
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
        layerBeforeId={MAP_LAYER_ORDER.assignmentLayerBeforeId}
      />
      {showDemographyOverlay && (
        <DemographicLayer
          idBase={BLOCK_HOVER_LAYER_ID_CHILD}
          sourceLayerId={childSourceLayerId}
          filter={childLayerFilter}
          layerBeforeId={MAP_LAYER_ORDER.demographyLayerBeforeId}
        />
      )}
      <HoverLayerGroup
        idBase={BLOCK_HOVER_LAYER_ID_CHILD}
        sourceLayerId={childSourceLayerId}
        filter={childLayerFilter}
        layerBeforeId={MAP_LAYER_ORDER.hoverLayerBeforeId}
      />
      <GeometryOutlineLayer
        id={GEOMETRY_OUTLINE_LAYER_IDS.child}
        sourceLayerId={childSourceLayerId}
        filter={childLayerFilter}
        beforeId={layerBeforeId}
        style={{lineWidth: 1}}
      />
    </>
  );
}

export function DemographicChildBlockLayers({layerBeforeId}: {layerBeforeId: string}) {
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
        layerBeforeId={MAP_LAYER_ORDER.demographyLayerBeforeId}
      />
      <HoverLayerGroup
        idBase={BLOCK_HOVER_LAYER_ID_CHILD}
        sourceLayerId={childSourceLayerId}
        filter={childLayerFilter}
        layerBeforeId={MAP_LAYER_ORDER.hoverLayerBeforeId}
      />
      <GeometryOutlineLayer
        id={GEOMETRY_OUTLINE_LAYER_IDS.child}
        sourceLayerId={childSourceLayerId}
        filter={childLayerFilter}
        beforeId={layerBeforeId}
        style={{lineWidth: 1}}
      />
    </>
  );
}
