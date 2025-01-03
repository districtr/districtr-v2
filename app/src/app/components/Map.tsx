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
import {MapTooltip} from './MapTooltip';
import { MapLockShade } from './MapLockShade';

export const MapComponent: React.FC = () => {
  const map: MutableRefObject<Map | null> = useRef(null);
  const mapContainer: MutableRefObject<HTMLDivElement | null> = useRef(null);
  const mapLock = useMapStore(state => state.mapLock);
  const setMapRef = useMapStore(state => state.setMapRef);
  const mapOptions = useMapStore(state => state.mapOptions);

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
    });

    fitMapToBounds();
    handleWheelOrPinch({} as TouchEvent, map.current);
    map.current.addControl(new maplibregl.NavigationControl());

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
      mapContainer?.current?.addEventListener(
        action.action as keyof MapLayerEventType,
        (e) => {
          action.handler(e, map.current);
        }
      );
    });

    return () => {
      mapEvents.forEach(action => {
        map.current?.off(action.action, e => {
          action.handler(e, map.current);
        });
      });

      mapContainerEvents.forEach(action => {
        mapContainer?.current?.removeEventListener(
          action.action as keyof MapLayerEventType,
          (e) => {
            action.handler(e, map.current);
          }
        );
      });
    }
  });

  return (
    <>
      <div
        className={`h-full relative w-full flex-1 lg:h-screen landscape:h-screen
    ${mapLock ? 'pointer-events-none' : ''}
    `}
        ref={mapContainer}
      >
      <MapLockShade />
      </div>
      <MapTooltip />
    </>
  );
};
