'use client';
import type {FilterSpecification, MapLayerEventType} from 'maplibre-gl';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Protocol} from 'pmtiles';
import type {MutableRefObject} from 'react';
import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {MAP_OPTIONS} from '@constants/configuration';
import {handleWheelOrPinch, mapContainerEvents, mapEventHandlers} from '@utils/events/mapEvents';
import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  INTERACTIVE_LAYERS,
} from '@constants/layers';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import GlMap, {NavigationControl, type MapRef} from 'react-map-gl/maplibre';
import {useLayoutEffect} from 'react';
import {CountyLayers} from './PolygonLayers/CountyLayers';
import {BlockSource} from './GeoSources/BlockSource';
import {useLayerFilter} from '@/app/hooks/useLayerFilter';
import {VtdBlockLayers} from './PolygonLayers/VtdBlockLayers';
import GeometryOutlineLayer from './PolygonLayers/GeometryOutlineLayer';
import {MetaLayers} from './PointLayers/MetaLayers';
import {PointSelectionLayer} from './PointLayers/PointSelectionLayer';
import {OverlayLayers} from './PolygonLayers/OverlayLayers';
import {MapLayerAnchors} from './MapLayerAnchors';
// @ts-ignore plugin has no types
import syncMaps from '@mapbox/mapbox-gl-sync-move';
import {useMapRenderer} from '@/app/hooks/useMapRenderer';
import {PointSource} from './GeoSources/PointSource';
import {GeometryBackgroundLayer} from './PolygonLayers/GeometryBackgroundLayer';

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

/**
 * Shared rendering shell for both main and demographic map variants.
 *
 * Responsibilities owned here:
 * - Apply common container classes for map lock, missing-document dimming, and active cursor.
 * - Register/unregister DOM container events from `mapContainerEvents`.
 * - Wire the shared `GlMap` event handlers from `mapEventHandlers`.
 * - Enforce common interaction constraints (no rotate/pitch) and shared interactive layers.
 *
 * Responsibilities intentionally not owned here:
 * - Protocol registration (e.g. pmtiles), map syncing, or store-specific map-ref setup.
 * - Variant-specific load behavior and side effects.
 * - Layer selection/composition and ordering.
 *
 * Those variant concerns are injected by callers via `onMapLoad` and `children`.
 */
function MapShell({
  mapRef,
  initialViewState,
  onMapLoad,
  borderLeft = false,
  children,
}: {
  mapRef: MutableRefObject<MapRef | null>;
  initialViewState: {latitude: number; longitude: number; zoom: number} | undefined;
  onMapLoad: (e: any) => void;
  borderLeft?: boolean;
  children: React.ReactNode;
}) {
  const mapContainer: MutableRefObject<HTMLDivElement | null> = useRef(null);
  const mapLock = useMapStore(state => state.mapLock);
  const document_id = useMapStore(state => state.mapDocument?.document_id);
  const activeTool = useMapControlsStore(state => state.activeTool);

  useLayoutEffect(() => {
    if (!mapContainer.current) return;
    mapContainerEvents.forEach(action => {
      mapContainer?.current?.addEventListener(action.action as keyof MapLayerEventType, e => {
        action.handler(e, mapRef.current);
      });
    });
    return () => {
      mapContainerEvents.forEach(action => {
        mapContainer?.current?.removeEventListener(action.action as keyof MapLayerEventType, e => {
          action.handler(e, mapRef.current);
        });
      });
    };
  });

  return (
    <div
      className={`relative w-full flex-1 flex-grow
        ${mapLock ? 'pointer-events-none' : ''}
        ${document_id ? '' : 'opacity-25 pointer-events-none'}
        ${borderLeft ? 'border-l-2 border-black' : ''}
        cursor-${activeTool}
        `}
      ref={mapContainer}
    >
      <GlMap
        ref={mapRef}
        mapStyle={MAP_OPTIONS.style || undefined}
        initialViewState={initialViewState}
        maxZoom={MAP_OPTIONS.maxZoom || undefined}
        pitchWithRotate={false}
        maxPitch={0}
        minPitch={0}
        dragRotate={false}
        onLoad={onMapLoad}
        onClick={mapEventHandlers.onClick}
        onZoom={mapEventHandlers.onZoom}
        onZoomEnd={mapEventHandlers.onZoomEnd}
        onContextMenu={mapEventHandlers.onContextMenu}
        onMouseMove={mapEventHandlers.onMouseMove}
        onMouseDown={mapEventHandlers.onMouseDown}
        onMouseEnter={mapEventHandlers.onMouseEnter}
        onMouseOver={mapEventHandlers.onMouseOver}
        onMouseLeave={mapEventHandlers.onMouseLeave}
        onMouseOut={mapEventHandlers.onMouseOut}
        onMouseUp={mapEventHandlers.onMouseUp}
        onZoomStart={mapEventHandlers.onZoom}
        onIdle={mapEventHandlers.onIdle}
        onMoveEnd={mapEventHandlers.onMoveEnd}
        onData={mapEventHandlers.onData as any}
        interactiveLayerIds={INTERACTIVE_LAYERS}
      >
        {children}
      </GlMap>
    </div>
  );
}

export const MainMapComponent: React.FC = () => {
  const setMapRef = useMapStore(state => state.setMapRef);
  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const mapDocument = useMapStore(state => state.mapDocument);
  const childLayerFilter = useLayerFilter(true);
  const parentLayerFilter = useLayerFilter(false);
  const parentAssignmentFilter = ['literal', true] as FilterSpecification;
  const showGeometryBackground = !mapOptions.showDemographicMap;
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
    <MapShell
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
      <CountyLayers layerBeforeId={MAP_LAYER_ORDER.countyLayerBeforeId} />
      <BlockSource>
        {showGeometryBackground && mapDocument?.parent_layer && (
          <GeometryBackgroundLayer
            id={`${BLOCK_HOVER_LAYER_ID}-background`}
            sourceLayerId={mapDocument.parent_layer}
            filter={parentAssignmentFilter}
            beforeId={BLOCK_HOVER_LAYER_ID}
            backgroundOpacity={UNASSIGNED_BACKGROUND_OPACITY.parent}
          />
        )}
        {showGeometryBackground && mapDocument?.child_layer && (
          <GeometryBackgroundLayer
            id={`${BLOCK_HOVER_LAYER_ID_CHILD}-background`}
            sourceLayerId={mapDocument.child_layer}
            filter={childLayerFilter}
            beforeId={BLOCK_HOVER_LAYER_ID_CHILD}
            backgroundOpacity={UNASSIGNED_BACKGROUND_OPACITY.child}
          />
        )}
        <VtdBlockLayers
          isDemographicMap={false}
          layerOrder={{
            assignmentLayerBeforeId: MAP_LAYER_ORDER.assignmentLayerBeforeId,
            demographyLayerBeforeId: MAP_LAYER_ORDER.demographyLayerBeforeId,
            hoverLayerBeforeId: MAP_LAYER_ORDER.hoverLayerBeforeId,
          }}
        />
        <GeometryOutlineLayer
          lineWidth={2}
          sourceLayerId={mapDocument?.parent_layer}
          lineId={GEOMETRY_OUTLINE_LAYER_IDS.parent}
          beforeId={MAP_LAYER_ORDER.geometryOutlineLayerBeforeId}
          filter={parentLayerFilter}
        />
        <GeometryOutlineLayer
          lineWidth={1}
          sourceLayerId={mapDocument?.child_layer}
          lineId={GEOMETRY_OUTLINE_LAYER_IDS.child}
          beforeId={MAP_LAYER_ORDER.geometryOutlineLayerBeforeId}
          filter={childLayerFilter}
        />
      </BlockSource>
      <OverlayLayers layerBeforeId={MAP_LAYER_ORDER.overlayLayerBeforeId} />
      <PointSource>
        <PointSelectionLayer />
        <PointSelectionLayer child />
        <MetaLayers isDemographicMap={false} />
      </PointSource>
      <NavigationControl showCompass={false} showZoom={true} position="bottom-right" />
    </MapShell>
  );
};

export const DemographicMapComponent: React.FC = () => {
  const getStateMapRef = useMapStore(state => state.getMapRef);
  const mapDocument = useMapStore(state => state.mapDocument);
  const childLayerFilter = useLayerFilter(true);
  const parentLayerFilter = useLayerFilter(false);
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
    <MapShell
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
      <CountyLayers layerBeforeId={MAP_LAYER_ORDER.countyLayerBeforeId} />
      <BlockSource>
        <VtdBlockLayers
          isDemographicMap={true}
          layerOrder={{
            assignmentLayerBeforeId: MAP_LAYER_ORDER.assignmentLayerBeforeId,
            demographyLayerBeforeId: MAP_LAYER_ORDER.demographyLayerBeforeId,
            hoverLayerBeforeId: MAP_LAYER_ORDER.hoverLayerBeforeId,
          }}
        />
        <GeometryOutlineLayer
          lineWidth={2}
          sourceLayerId={mapDocument?.parent_layer}
          lineId={GEOMETRY_OUTLINE_LAYER_IDS.parent}
          beforeId={MAP_LAYER_ORDER.geometryOutlineLayerBeforeId}
          filter={parentLayerFilter}
        />
        <GeometryOutlineLayer
          lineWidth={1}
          sourceLayerId={mapDocument?.child_layer}
          lineId={GEOMETRY_OUTLINE_LAYER_IDS.child}
          beforeId={MAP_LAYER_ORDER.geometryOutlineLayerBeforeId}
          filter={childLayerFilter}
        />
      </BlockSource>
      <OverlayLayers layerBeforeId={MAP_LAYER_ORDER.overlayLayerBeforeId} />
      <PointSource>
        <PointSelectionLayer />
        <PointSelectionLayer child />
        <MetaLayers isDemographicMap={true} />
      </PointSource>
      <NavigationControl showCompass={false} showZoom={true} position="bottom-right" />
    </MapShell>
  );
};

// Backwards compatible export for older imports.
export const MapComponent = MainMapComponent;
