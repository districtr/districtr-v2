'use client';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Protocol} from 'pmtiles';
import React, {useCallback, useEffect, useMemo} from 'react';
import {MAP_OPTIONS} from '@constants/configuration';
import {handleWheelOrPinch} from '@utils/events/mapEvents';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
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
import {ParentBlockLayers} from './PolygonLayers/ParentBlockLayers';
import {ChildBlockLayers} from './PolygonLayers/ChildBlockLayers';
import {DemographyColorController} from './PolygonLayers/DemographyColorController';
import type {ParentChildBlockLayerOrder} from './PolygonLayers/layerContracts';

/**
 * Global z-order from top -> bottom:
 * labels -> hover -> overlays -> geometry-outline -> demography -> assignments -> counties.
 * Anchors are mounted by <MapLayerAnchors /> and all map layers target these ids via beforeId.
 */
const MAIN_BLOCK_LAYER_ORDER: ParentChildBlockLayerOrder = {
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

export const MainMap: React.FC = () => {
  const setMapRef = useMapStore(state => state.setMapRef);
  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const {mapRef, onLoad} = useMapRenderer('main');

  const initialViewState = useMemo(() => {
    const center = MAP_OPTIONS.center as [number, number];
    return {
      latitude: center[1],
      longitude: center[0],
      zoom: MAP_OPTIONS.zoom ?? 3,
    };
  }, []);

  useEffect(() => {
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    return () => maplibregl.removeProtocol('pmtiles');
  }, []);

  const fitMapToBounds = useCallback(() => {
    if (!mapRef.current || !mapOptions.bounds) return;
    mapRef.current.fitBounds(mapOptions.bounds, {
      padding: 20,
    });
  }, [mapRef, mapOptions.bounds]);

  useEffect(() => {
    fitMapToBounds();
  }, [fitMapToBounds]);

  return (
    <MapContainer
      mapRef={mapRef}
      initialViewState={initialViewState}
      onMapLoad={e => {
        onLoad(e);
        setMapRef(mapRef);
        handleWheelOrPinch({} as TouchEvent, mapRef.current);
        fitMapToBounds();
      }}
    >
      <MapLayerAnchors />
      <CountyLayers layerBeforeId={MAP_LAYER_ANCHORS.counties} />
      <BlockSource>
        <ParentBlockLayers layerOrder={MAIN_BLOCK_LAYER_ORDER.parent} />
        <ChildBlockLayers layerOrder={MAIN_BLOCK_LAYER_ORDER.child} />
        <DemographyColorController enabled={mapOptions.showDemographicMap === 'overlay'} />
      </BlockSource>
      <OverlayLayers layerBeforeId={MAP_LAYER_ANCHORS.overlays} />
      <PointSource>
        <PointSelectionLayer />
        <PointSelectionLayer child />
        <MetaLayers isDemographicMap={false} />
      </PointSource>
      <NavigationControl showCompass={false} showZoom={true} position="bottom-right" />
    </MapContainer>
  );
};
