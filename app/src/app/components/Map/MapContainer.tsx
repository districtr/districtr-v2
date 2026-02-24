import type {MapLayerEventType} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type {MutableRefObject} from 'react';
import React, {useRef} from 'react';
import {MAP_OPTIONS} from '@constants/configuration';
import {mapContainerEvents, mapEventHandlers} from '@utils/events/mapEvents';
import {INTERACTIVE_LAYERS} from '@constants/map/layerIds';
import GlMap, {type MapRef} from 'react-map-gl/maplibre';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useLayoutEffect} from 'react';

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
export const MapContainer: React.FC<{
  mapRef: MutableRefObject<MapRef | null>;
  initialViewState: {latitude: number; longitude: number; zoom: number} | undefined;
  onMapLoad: (e: any) => void;
  borderLeft?: boolean;
  children: React.ReactNode;
}> = ({mapRef, initialViewState, onMapLoad, borderLeft = false, children}) => {
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
};
