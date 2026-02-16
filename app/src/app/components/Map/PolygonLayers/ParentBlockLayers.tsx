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
import {GEOMETRY_OUTLINE_LAYER_IDS, UNASSIGNED_BACKGROUND_OPACITY} from './layerConstants';
import type {BlockLayerOrder} from './layerContracts';
import {ZoneLayerGroup} from './ZoneLayers/ZoneLayerGroup';

export function ParentBlockLayers({layerOrder}: {layerOrder: BlockLayerOrder}) {
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
          beforeId={layerOrder.backgroundBeforeId}
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
        layerBeforeId={layerOrder.zoneBeforeId}
      />
      {showDemographyOverlay && (
        <DemographicLayer
          idBase={BLOCK_HOVER_LAYER_ID}
          sourceLayerId={parentSourceLayerId}
          filter={parentLayerFilter}
          layerBeforeId={layerOrder.demographyBeforeId}
        />
      )}
      <HoverLayerGroup
        idBase={BLOCK_HOVER_LAYER_ID}
        sourceLayerId={parentSourceLayerId}
        filter={parentLayerFilter}
        layerBeforeId={layerOrder.hoverBeforeId}
      />

      <GeometryOutlineLayer
        id={GEOMETRY_OUTLINE_LAYER_IDS.parent}
        sourceLayerId={parentSourceLayerId}
        filter={parentOutlineFilter}
        beforeId={layerOrder.outlineBeforeId}
        style={{lineWidth: 2}}
      />
    </>
  );
}

export function DemographicParentBlockLayers({layerOrder}: {layerOrder: BlockLayerOrder}) {
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
        layerBeforeId={layerOrder.demographyBeforeId}
      />
      <HoverLayerGroup
        idBase={BLOCK_HOVER_LAYER_ID}
        sourceLayerId={parentSourceLayerId}
        filter={parentLayerFilter}
        layerBeforeId={layerOrder.hoverBeforeId}
      />

      <GeometryOutlineLayer
        id={GEOMETRY_OUTLINE_LAYER_IDS.parent}
        sourceLayerId={parentSourceLayerId}
        filter={parentOutlineFilter}
        beforeId={layerOrder.outlineBeforeId}
        style={{lineWidth: 2}}
      />
    </>
  );
}
