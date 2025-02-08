'use client';
import type {MapLayerEventType} from 'maplibre-gl';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Protocol} from 'pmtiles';
import type {MutableRefObject} from 'react';
import React, {useEffect, useRef} from 'react';
import {MAP_OPTIONS} from '../../constants/configuration';
import {handleWheelOrPinch, mapContainerEvents, mapEventHandlers} from '../../utils/events/mapEvents';
import {INTERACTIVE_LAYERS} from '../../constants/layers';
import {useMapStore} from '../../store/mapStore';
import GlMap, {MapRef, NavigationControl} from 'react-map-gl/maplibre';
import {useLayoutEffect} from 'react';
import { CountyLayers } from './CountyLayers';
import { ZoneLayerGroup, ZoneLayers } from './ZoneLayers';
import { MetaLayers } from './MetaLayers';

export const MapComponent: React.FC = () => {
  const mapRef: MutableRefObject<MapRef | null> = useRef(null);
  const mapContainer: MutableRefObject<HTMLDivElement | null> = useRef(null);
  const mapLock = useMapStore(state => state.mapLock);
  const setMapRef = useMapStore(state => state.setMapRef);
  const mapOptions = useMapStore(state => state.mapOptions);
  const document_id = useMapStore(state => state.mapDocument?.document_id);

  useEffect(() => {
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    return () => {
      maplibregl.removeProtocol('pmtiles');
    };
  }, []);

  const fitMapToBounds = () => {
    if (mapRef.current && mapOptions.bounds) {
      if (mapOptions.bounds) {
        mapRef.current.fitBounds(mapOptions.bounds, {
          padding: 20,
        });
      }
    }
  };

  useEffect(fitMapToBounds, [mapOptions.bounds]);

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
        `}
      ref={mapContainer}
    >
      <GlMap
        ref={mapRef}
        mapStyle={MAP_OPTIONS.style || undefined}
        // latitude={MAP_OPTIONS.center?.  || undefined}
        // center={MAP_OPTIONS.center  || undefined}
        // zoom={MAP_OPTIONS.zoom  || undefined}
        maxZoom={MAP_OPTIONS.maxZoom || undefined}
        pitchWithRotate={false}
        maxPitch={0}
        minPitch={0}
        dragRotate={false}
        onLoad={() => {
          if (mapRef.current) {
            setMapRef(mapRef);
            handleWheelOrPinch({} as TouchEvent, mapRef.current);
            fitMapToBounds();
          }
        }}
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
        onData={mapEventHandlers.onData}
        interactiveLayerIds={INTERACTIVE_LAYERS}
        reuseMaps
      >
        <CountyLayers />
        <ZoneLayers />
        <MetaLayers />
        <NavigationControl showCompass={false} showZoom={true} position="bottom-right" />

      </GlMap>
    </div>
  );
};
