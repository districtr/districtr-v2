'use client';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {MAP_OPTIONS} from '@constants/configuration';
import {useMapStore} from '@store/mapStore';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {NavigationControl} from 'react-map-gl/maplibre';
import {CountyLayers} from './PolygonLayers/CountyLayers';
import {BlockSource} from './GeoSources/BlockSource';
import {MetaLayers} from './PointLayers/MetaLayers';
import {PointSelectionLayer} from './PointLayers/PointSelectionLayer';
import {OverlayLayers} from './PolygonLayers/OverlayLayers';
import {MapLayerAnchors, MAP_LAYER_ANCHORS} from './MapLayerAnchors';
import {MapContainer} from './MapContainer';
// @ts-ignore plugin has no types
import syncMaps from '@mapbox/mapbox-gl-sync-move';
import {useMapRenderer} from '@/app/hooks/useMapRenderer';
import {PointSource} from './GeoSources/PointSource';
import {DemographicParentBlockLayers} from './PolygonLayers/ParentBlockLayers';
import {DemographicChildBlockLayers} from './PolygonLayers/ChildBlockLayers';
import {DemographyColorController} from './PolygonLayers/DemographyColorController';
import type {ParentChildBlockLayerOrder} from './PolygonLayers/layerContracts';

const DEMOGRAPHIC_BLOCK_LAYER_ORDER: ParentChildBlockLayerOrder = {
  parent: {
    backgroundBeforeId: MAP_LAYER_ANCHORS.assignments,
    zoneBeforeId: MAP_LAYER_ANCHORS.assignments,
    demographyBeforeId: MAP_LAYER_ANCHORS.demography,
    hoverBeforeId: MAP_LAYER_ANCHORS.hover,
    outlineBeforeId: MAP_LAYER_ANCHORS.overlays,
  },
  child: {
    backgroundBeforeId: MAP_LAYER_ANCHORS.assignments,
    zoneBeforeId: MAP_LAYER_ANCHORS.assignments,
    demographyBeforeId: MAP_LAYER_ANCHORS.demography,
    hoverBeforeId: MAP_LAYER_ANCHORS.hover,
    outlineBeforeId: MAP_LAYER_ANCHORS.overlays,
  },
};

export const DemographicMap: React.FC = () => {
  const getStateMapRef = useMapStore(state => state.getMapRef);
  const synced = useRef<false | (() => void)>(false);
  const {mapRef, onLoad} = useMapRenderer('demographic');

  const initialViewState = useMemo(() => {
    const mainMapRef = getStateMapRef();
    if (!mainMapRef) return;
    const center = mainMapRef.getCenter();
    const zoom = mainMapRef.getZoom();
    return {
      latitude: center.lat,
      longitude: center.lng,
      zoom: zoom ?? MAP_OPTIONS.zoom ?? 3,
    };
  }, [getStateMapRef]);

  const handleSyncMaps = useCallback(
    (demoMapRef?: maplibregl.Map) => {
      const mainMapRef = getStateMapRef();
      if (!demoMapRef || !mainMapRef || synced.current !== false) return;
      synced.current = syncMaps(demoMapRef, mainMapRef);
    },
    [getStateMapRef]
  );

  useEffect(() => {
    handleSyncMaps(mapRef.current?.getMap());
    return () => {
      if (synced.current) {
        synced.current();
        synced.current = false;
      }
      useDemographyStore.getState().unmount();
      mapRef.current = null;
    };
  }, [handleSyncMaps, mapRef]);

  return (
    <MapContainer
      mapRef={mapRef}
      initialViewState={initialViewState}
      borderLeft
      onMapLoad={e => {
        onLoad(e);
        handleSyncMaps(e.target);
        useDemographyStore.getState().setGetMapRef(() => e.target);
      }}
    >
      <MapLayerAnchors />
      <CountyLayers layerBeforeId={MAP_LAYER_ANCHORS.counties} />
      <BlockSource>
        <DemographicParentBlockLayers layerOrder={DEMOGRAPHIC_BLOCK_LAYER_ORDER.parent} />
        <DemographicChildBlockLayers layerOrder={DEMOGRAPHIC_BLOCK_LAYER_ORDER.child} />
        <DemographyColorController enabled={true} />
      </BlockSource>
      <OverlayLayers layerBeforeId={MAP_LAYER_ANCHORS.overlays} />
      <PointSource>
        <PointSelectionLayer />
        <PointSelectionLayer child />
        <MetaLayers isDemographicMap={true} />
      </PointSource>
      <NavigationControl showCompass={false} showZoom={true} position="bottom-right" />
    </MapContainer>
  );
};
