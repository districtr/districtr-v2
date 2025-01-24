import type {Map, MapLayerEventType} from 'maplibre-gl';
import maplibregl, {MapLayerMouseEvent, MapLayerTouchEvent} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Protocol} from 'pmtiles';
import type {MutableRefObject} from 'react';
import React, {useEffect, useRef} from 'react';
import {MAP_OPTIONS} from '../constants/configuration';
import {handleWheelOrPinch, mapContainerEvents, mapEvents} from '../utils/events/mapEvents';
import {INTERACTIVE_LAYERS} from '../constants/layers';
import {useMapStore} from '../store/mapStore';

export const MapComponent: React.FC = () => {
  const map: MutableRefObject<Map | null> = useRef(null);
  const mapContainer: MutableRefObject<HTMLDivElement | null> = useRef(null);
  const mapLock = useMapStore(state => state.mapLock);
  const setMapRef = useMapStore(state => state.setMapRef);
  const mapOptions = useMapStore(state => state.mapOptions);
  const document_id = useMapStore(state => state.mapDocument?.document_id);

  useEffect(() => {
    let protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    return () => {
      maplibregl.removeProtocol('pmtiles');
    };
  }, []);

  const fitMapToBounds = () => {
    if (map.current && mapOptions.bounds) {
      if (mapOptions.bounds) {
        map.current.fitBounds(mapOptions.bounds, {
          padding: 20,
        });
      }
    }
  };
  useEffect(fitMapToBounds, [mapOptions.bounds]);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_OPTIONS.style,
      center: MAP_OPTIONS.center,
      zoom: MAP_OPTIONS.zoom,
      maxZoom: MAP_OPTIONS.maxZoom,
      pitchWithRotate: false,
      maxPitch: 0,
      minPitch: 0,
      dragRotate: false,
    });

    fitMapToBounds();
    handleWheelOrPinch({} as TouchEvent, map.current);
    map.current.addControl(
      new maplibregl.NavigationControl({
        showCompass: false,
        showZoom: true,
      }),
      'bottom-right'
    );

    map.current.on('load', () => {
      setMapRef(map);
    });

    INTERACTIVE_LAYERS.forEach(layer => {
      mapEvents.forEach(action => {
        if (map.current) {
          map.current?.on(
            action.action as keyof MapLayerEventType,
            layer, // to be updated with the scale-agnostic layer id
            (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
              action.handler(e, map.current);
            }
          );
        }
      });
    });

    mapContainerEvents.forEach(action => {
      mapContainer?.current?.addEventListener(action.action as keyof MapLayerEventType, e => {
        action.handler(e, map.current);
      });
    });

    return () => {
      mapEvents.forEach(action => {
        map.current?.off(action.action, e => {
          action.handler(e, map.current);
        });
      });

      mapContainerEvents.forEach(action => {
        mapContainer?.current?.removeEventListener(action.action as keyof MapLayerEventType, e => {
          action.handler(e, map.current);
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
    />
  );
};
