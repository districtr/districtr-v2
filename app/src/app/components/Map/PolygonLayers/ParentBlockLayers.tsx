'use client';
import type {FilterSpecification} from 'maplibre-gl';
import {BLOCK_SOURCE_ID, BLOCK_HOVER_LAYER_ID} from '@constants/layers';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useMap} from 'react-map-gl/maplibre';
import {useLayerFilter} from '@/app/hooks/useLayerFilter';
import GeometryOutlineLayer from './GeometryOutlineLayer';
import {ParentHoverLayerGroup} from './HoverLayerGroup';
import {GeometryBackgroundLayer} from './GeometryBackgroundLayer';
import {DemographicParentLayer} from './DemographicLayer';
import ZoneParentLayerGroup from './ZoneLayers/ZoneParentLayerGroup';
import {useLayoutEffect} from 'react';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {demographyCache} from '@/app/utils/demography/demographyCache';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';

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
  const demographicVariable = useDemographyStore(state => state.variable);
  const demographicVariant = useDemographyStore(state => state.variant);
  const setScale = useDemographyStore(state => state.setScale);
  const demographyDataHash = useDemographyStore(state => state.dataHash);
  const mapRef = useMap();
  const numberOfBins = useDemographyStore(state => state.numberOfBins);
  const shatterIds = useAssignmentsStore(state => state.shatterIds);

  if (!mapDocument?.parent_layer) {
    return null;
  }

  const handleChoroplethRender = ({numberOfBins}: {numberOfBins?: number}) => {
    const _map = mapRef.current?.getMap();
    if (_map) {
      const updateFn = () => {
        const mapScale = demographyCache.calculateDemographyColorScale({
          variable: demographicVariable,
          variant: demographicVariant,
          mapRef: _map,
          mapDocument,
          numberOfBins: numberOfBins || 5,
          paintMap: true,
        });
        mapScale && setScale(mapScale);
        return mapScale;
      };
      // handle asynchronous map / source loads
      if (_map?.getSource(BLOCK_SOURCE_ID)) {
        return updateFn();
      } else {
        _map.on('load', () => {
          const r = updateFn();
          if (r) {
            _map.off('load', updateFn);
          }
        });
      }
    }
    return false;
  };

  useLayoutEffect(() => {
    if (showDemographyOverlay && mapDocument) {
      handleChoroplethRender({numberOfBins});
    }
  }, [
    numberOfBins,
    showDemographyOverlay,
    demographicVariable,
    demographyDataHash,
    shatterIds,
    mapDocument,
    demographicVariant,
  ]);

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
  const demographicVariable = useDemographyStore(state => state.variable);
  const demographicVariant = useDemographyStore(state => state.variant);
  const setScale = useDemographyStore(state => state.setScale);
  const demographyDataHash = useDemographyStore(state => state.dataHash);
  const showDemography = true;
  const mapRef = useMap();
  const numberOfBins = useDemographyStore(state => state.numberOfBins);
  const shatterIds = useAssignmentsStore(state => state.shatterIds);

  if (!mapDocument?.parent_layer) {
    return null;
  }

  const handleChoroplethRender = ({numberOfBins}: {numberOfBins?: number}) => {
    const _map = mapRef.current?.getMap();
    if (_map) {
      const updateFn = () => {
        const mapScale = demographyCache.calculateDemographyColorScale({
          variable: demographicVariable,
          variant: demographicVariant,
          mapRef: _map,
          mapDocument,
          numberOfBins: numberOfBins || 5,
          paintMap: true,
        });
        mapScale && setScale(mapScale);
        return mapScale;
      };
      // handle asynchronous map / source loads
      if (_map?.getSource(BLOCK_SOURCE_ID)) {
        return updateFn();
      } else {
        _map.on('load', () => {
          const r = updateFn();
          if (r) {
            _map.off('load', updateFn);
          }
        });
      }
    }
    return false;
  };

  useLayoutEffect(() => {
    handleChoroplethRender({numberOfBins});
  }, [
    numberOfBins,
    showDemography,
    demographicVariable,
    demographyDataHash,
    shatterIds,
    mapDocument,
    demographicVariant,
  ]);
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
