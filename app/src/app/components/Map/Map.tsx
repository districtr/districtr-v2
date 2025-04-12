'use client';
import type {LngLatBoundsLike, MapLayerEventType} from 'maplibre-gl';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Protocol} from 'pmtiles';
import type {MutableRefObject} from 'react';
import React, {useEffect, useMemo, useRef} from 'react';
import {MAP_OPTIONS} from '@constants/configuration';
import {handleWheelOrPinch, mapContainerEvents, mapEventHandlers} from '@utils/events/mapEvents';
import {INTERACTIVE_LAYERS} from '@constants/layers';
import {useMapStore} from '@store/mapStore';
import {useDemographyStore} from '@/app/store/demographyStore';
import GlMap, {MapRef, NavigationControl} from 'react-map-gl/maplibre';
import {useLayoutEffect} from 'react';
import {CountyLayers} from './CountyLayers';
import {VtdBlockLayers} from './VtdBlockLayers';
import {MetaLayers} from './MetaLayers';
// @ts-ignore plugin has no types
import syncMaps from '@mapbox/mapbox-gl-sync-move';
import {useMapRenderer} from '@/app/hooks/useMapRenderer';

export const MapComponent: React.FC<{isDemographicMap?: boolean}> = ({isDemographicMap}) => {
  const getStateMapRef = useMapStore(state => state.getMapRef);
  const mapContainer: MutableRefObject<HTMLDivElement | null> = useRef(null);
  const mapLock = useMapStore(state => state.mapLock);
  const setMapRef = useMapStore(state => state.setMapRef);
  const mapOptions = useMapStore(state => state.mapOptions);
  const document_id = useMapStore(state => state.mapDocument?.document_id);
  const synced = useRef<false | (() => void)>(false);
  const {mapRef, onLoad} = useMapRenderer(isDemographicMap ? 'demographic' : 'main');

  const initialViewState = useMemo(() => {
    if (!isDemographicMap) {
      // Maplibre and react-map-gl disagree on types
      const center = MAP_OPTIONS.center as [number, number];
      return {
        latitude: center[1],
        longitude: center[0],
        zoom: MAP_OPTIONS.zoom,
      };
    }
    const mainMapRef = getStateMapRef();
    if (!mainMapRef) return;
    const center = mainMapRef.getCenter();
    const zoom = mainMapRef.getZoom();
    return {
      latitude: center.lat,
      longitude: center.lng,
      zoom,
    };
  }, [getStateMapRef]);

  useEffect(() => {
    if (!isDemographicMap) {
      const protocol = new Protocol();
      maplibregl.addProtocol('pmtiles', protocol.tile);
    }

    return () => {
      if (!isDemographicMap) {
        maplibregl.removeProtocol('pmtiles');
      }
    };
  }, []);

  const handleSyncMaps = (demoMapRef?: maplibregl.Map) => {
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
      if (isDemographicMap) {
        useDemographyStore.getState().unmount();
        mapRef.current = null;
      }
    };
  }, [getStateMapRef]);

  const fitMapToBounds = () => {
    const cleanAlaska = (bounds: LngLatBoundsLike): LngLatBoundsLike => {
      if (bounds[2] > 0) {
        bounds[2] = -129.9;
      }
      return bounds;
    };

    if (mapRef.current && mapOptions.bounds && !isDemographicMap) {
      if (mapOptions.bounds) {
        mapRef.current.fitBounds(cleanAlaska(mapOptions.bounds), {
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
        ${isDemographicMap ? 'border-l-2 border-black' : ''}
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
        onLoad={e => {
          onLoad(e);
          if (isDemographicMap) {
            handleSyncMaps(e.target);
            useDemographyStore.getState().setGetMapRef(() => e.target);
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
        <MetaLayers isDemographicMap={isDemographicMap} />
        <NavigationControl showCompass={false} showZoom={true} position="bottom-right" />
      </GlMap>
    </div>
  );
};
