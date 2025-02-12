'use client';
import type {MapLayerEventType} from 'maplibre-gl';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Protocol} from 'pmtiles';
import type {MutableRefObject} from 'react';
import React, {useEffect, useRef} from 'react';
import {MAP_OPTIONS} from '../../constants/configuration';
import {
  handleWheelOrPinch,
  mapContainerEvents,
  mapEventHandlers,
} from '../../utils/events/mapEvents';
import {INTERACTIVE_LAYERS} from '../../constants/layers';
import {useDemographicMapStore, useMapStore} from '../../store/mapStore';
import GlMap, {MapRef, NavigationControl} from 'react-map-gl/maplibre';
import {useLayoutEffect} from 'react';
import {CountyLayers} from './CountyLayers';
import {VtdBlockLayers} from './VtdBlockLayers';
import {MetaLayers} from './MetaLayers';
// @ts-ignore
import syncMaps from '@mapbox/mapbox-gl-sync-move';
import {DemographicLegend} from './DemographicLegend';

export const MapComponent: React.FC<{isDemographicMap?: boolean}> = ({isDemographicMap}) => {
  const mapRef: MutableRefObject<MapRef | null> = useRef(null);
  const getStateMapRef = useMapStore(state => state.getMapRef);
  const mapContainer: MutableRefObject<HTMLDivElement | null> = useRef(null);
  const mapLock = useMapStore(state => state.mapLock);
  const setMapRef = useMapStore(state => state.setMapRef);
  const mapOptions = useMapStore(state => state.mapOptions);
  const document_id = useMapStore(state => state.mapDocument?.document_id);
  const synced = useRef<false | (() => void)>(false);

  useEffect(() => {
    if (!isDemographicMap) {
      const protocol = new Protocol();
      maplibregl.addProtocol('pmtiles', protocol.tile);
      return () => {
        maplibregl.removeProtocol('pmtiles');
      };
    }
  }, []);

  const handleSyncMaps = (demoMapRef?: any) => {
    const mainMapRef = getStateMapRef();
    if (isDemographicMap && demoMapRef && mainMapRef && synced.current === false) {
      synced.current = syncMaps(demoMapRef, mainMapRef);
    }
  };
  useEffect(() => {
    if (isDemographicMap) {
      handleSyncMaps(mapRef.current?.getMap());
    }
    return () => {
      if (synced.current) {
        synced.current();
        synced.current = false;
      }
      if (isDemographicMap){
        useDemographicMapStore.getState().unmount()
        mapRef.current = null;
      }
    }
  }, [getStateMapRef]);

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
      className={`relative w-full flex-1 flex-grow h-full
        ${mapLock ? 'pointer-events-none' : ''}
        ${document_id ? '' : 'opacity-25 pointer-events-none'}
        ${isDemographicMap ? 'border-l-2 border-black' : ''}
        `}
    >
      <div className="relative w-full h-full" ref={mapContainer}>
        <GlMap
          ref={mapRef}
          mapStyle={MAP_OPTIONS.style || undefined}
          initialViewState={{
            // Maplibre and react-map-gl disagree on types
            latitude: (MAP_OPTIONS.center as [number, number])?.[1] || 0,
            longitude: (MAP_OPTIONS.center as [number, number])?.[0] || 0,
            zoom: MAP_OPTIONS.zoom,
          }}
          maxZoom={MAP_OPTIONS.maxZoom || undefined}
          pitchWithRotate={false}
          maxPitch={0}
          minPitch={0}
          dragRotate={false}
          onLoad={(e) => {
            if (isDemographicMap) {
              handleSyncMaps(e.target);
              useDemographicMapStore.getState().setGetMapRef(() => e.target);
            } else {
              setMapRef(mapRef);
              handleWheelOrPinch({} as TouchEvent, mapRef.current);
            }
            fitMapToBounds();
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
          onData={mapEventHandlers.onData as any}
          interactiveLayerIds={INTERACTIVE_LAYERS}
          reuseMaps
        >
          <CountyLayers />
          <VtdBlockLayers isDemographicMap={isDemographicMap} />
          {!isDemographicMap && (
            <>
              <MetaLayers />
            </>
          )}
          <NavigationControl showCompass={false} showZoom={true} position="bottom-right" />
        </GlMap>
      </div>
      {isDemographicMap && <DemographicLegend />}
    </div>
  );
};
