import type {MapLayerEventType} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type {MutableRefObject} from 'react';
import React, {useRef, useMemo} from 'react';
import {MAP_OPTIONS, getMapStyleForBasemap} from '@constants/map/viewDefaults';
import {mapContainerEvents} from '@utils/events/mapEvents';
import {INTERACTIVE_LAYERS} from '@constants/map/layerIds';
import GlMap, {type MapRef} from 'react-map-gl/maplibre';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useLayoutEffect} from 'react';
import {GeocodeSearchBar} from './GeocodeSearchBar';
import {coiMapEventHandlers} from './CoiMapEvents';
import {BASEMAP_IDS} from '@constants/map/layerStyle';

export const CoiMapContainer: React.FC<{
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
  const basemap = useMapControlsStore(state => state.mapOptions.basemap ?? BASEMAP_IDS.MINIMAL);
  const mapBounds = useMapControlsStore(state => state.mapOptions.bounds);
  const mapStyle = useMemo(() => {
    const style = getMapStyleForBasemap(basemap);
    return style;
  }, [basemap]);
  const showGeocode = basemap === BASEMAP_IDS.STREETS || basemap === BASEMAP_IDS.SATELLITE;

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
      {showGeocode && (
        <div className="absolute top-3 left-3 z-10">
          <GeocodeSearchBar mapRef={mapRef} mapBounds={mapBounds} />
        </div>
      )}
      <GlMap
        ref={mapRef}
        mapStyle={mapStyle}
        initialViewState={initialViewState}
        maxZoom={MAP_OPTIONS.maxZoom || undefined}
        pitchWithRotate={false}
        maxPitch={0}
        minPitch={0}
        dragRotate={false}
        onLoad={onMapLoad}
        onClick={coiMapEventHandlers.onClick}
        onZoom={coiMapEventHandlers.onZoom}
        onZoomEnd={coiMapEventHandlers.onZoomEnd}
        onContextMenu={coiMapEventHandlers.onContextMenu}
        onMouseMove={coiMapEventHandlers.onMouseMove}
        onMouseDown={coiMapEventHandlers.onMouseDown}
        onMouseEnter={coiMapEventHandlers.onMouseEnter}
        onMouseOver={coiMapEventHandlers.onMouseOver}
        onMouseLeave={coiMapEventHandlers.onMouseLeave}
        onMouseOut={coiMapEventHandlers.onMouseOut}
        onMouseUp={coiMapEventHandlers.onMouseUp}
        onZoomStart={coiMapEventHandlers.onZoom}
        onIdle={coiMapEventHandlers.onIdle}
        onMoveEnd={coiMapEventHandlers.onMoveEnd}
        onData={coiMapEventHandlers.onData as any}
        interactiveLayerIds={INTERACTIVE_LAYERS}
      >
        {children}
      </GlMap>
    </div>
  );
};
