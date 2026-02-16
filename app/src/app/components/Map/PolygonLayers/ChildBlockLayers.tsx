'use client';
import {BLOCK_HOVER_LAYER_ID_CHILD} from '@constants/layers';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useLayerFilter} from '@/app/hooks/useLayerFilter';
import GeometryOutlineLayer from './GeometryOutlineLayer';
import {GeometryBackgroundLayer} from './GeometryBackgroundLayer';
import ZoneChildLayerGroup from './ZoneLayers/ZoneChildLayerGroup';
import {ChildHoverLayerGroup} from './HoverLayerGroup';
import {DemographicChildLayer} from './DemographicLayer';

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

  return (
    <>
      {showGeometryBackground && (
        <GeometryBackgroundLayer
          id={`${BLOCK_HOVER_LAYER_ID_CHILD}-background`}
          sourceLayerId={mapDocument.child_layer}
          filter={childLayerFilter}
          beforeId={BLOCK_HOVER_LAYER_ID_CHILD}
          backgroundOpacity={UNASSIGNED_BACKGROUND_OPACITY.child}
        />
      )}
      <ZoneChildLayerGroup layerBeforeId={MAP_LAYER_ORDER.assignmentLayerBeforeId} />
      {showDemographyOverlay && (
        <DemographicChildLayer layerBeforeId={MAP_LAYER_ORDER.demographyLayerBeforeId} />
      )}
      <ChildHoverLayerGroup layerBeforeId={MAP_LAYER_ORDER.hoverLayerBeforeId} />
      <GeometryOutlineLayer
        id={GEOMETRY_OUTLINE_LAYER_IDS.child}
        lineWidth={1}
        sourceLayerId={mapDocument?.child_layer}
        beforeId={layerBeforeId}
        filter={childLayerFilter}
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

  return (
    <>
      <DemographicChildLayer layerBeforeId={MAP_LAYER_ORDER.demographyLayerBeforeId} />
      <ChildHoverLayerGroup layerBeforeId={MAP_LAYER_ORDER.hoverLayerBeforeId} />
      <GeometryOutlineLayer
        id={GEOMETRY_OUTLINE_LAYER_IDS.child}
        lineWidth={1}
        sourceLayerId={mapDocument.child_layer}
        beforeId={layerBeforeId}
        filter={childLayerFilter}
      />
    </>
  );
}
