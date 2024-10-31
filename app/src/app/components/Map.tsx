import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Protocol} from 'pmtiles';
import React, {useEffect, useRef} from 'react';
import {MAP_OPTIONS} from '../constants/configuration';
import {mapEvents} from '../utils/events/mapEvents';
import {INTERACTIVE_LAYERS} from '../constants/layers';
import {useMapStore} from '../store/mapStore';
import {styled} from '@stitches/react';

const MapContainer = styled('div', {
  variants: {
    tool: {
      brush: {canvas: {cursor: 'pointer'}},
      eraser: {canvas: {cursor: 'pointer'}},
      shatter: {canvas: {cursor: 'crosshair'}},
      lock: {canvas: {cursor: 'crosshair'}},
      pan: {canvas: {cursor: 'auto'}},
    },
    locked: {
      locked: {pointerEvents: 'none'},
    },
  },
});

export const MapComponent: React.FC = () => {
  const map: React.MutableRefObject<maplibregl.Map | null> = useRef(null);
  const mapContainer: React.MutableRefObject<HTMLDivElement | null> = useRef(null);
  const mapLock = useMapStore(state => state.mapLock);
  const setMapRef = useMapStore(state => state.setMapRef);
  const mapOptions = useMapStore(state => state.mapOptions);
  const activeTool = useMapStore(state => state.activeTool);

  useEffect(() => {
    let protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    return () => {
      maplibregl.removeProtocol('pmtiles');
    };
  }, []);

  useEffect(() => {
    if (map.current && mapOptions.bounds) {
      if (mapOptions.bounds) {
        map.current.fitBounds(mapOptions.bounds, {
          padding: 20,
        });
      }
    }
  }, [mapOptions]);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_OPTIONS.style,
      center: MAP_OPTIONS.center,
      zoom: MAP_OPTIONS.zoom,
      maxZoom: MAP_OPTIONS.maxZoom,
    });
    map.current.scrollZoom.setWheelZoomRate(1 / 300);
    map.current.scrollZoom.setZoomRate(1 / 300);

    map.current.addControl(new maplibregl.NavigationControl());

    map.current.on('load', () => {
      setMapRef(map);
    });
    INTERACTIVE_LAYERS.forEach(layer => {
      mapEvents.forEach(action => {
        if (map.current) {
          map.current?.on(
            action.action as keyof maplibregl.MapLayerEventType,
            layer, // to be updated with the scale-agnostic layer id
            (e: maplibregl.MapLayerMouseEvent | maplibregl.MapLayerTouchEvent) => {
              action.handler(e, map.current);
            }
          );
        }
      });
    });

    return () => {
      mapEvents.forEach(action => {
        map.current?.off(action.action, e => {
          action.handler(e, map.current);
        });
      });
    };
  });

  return (
    <MapContainer
      className={`h-full w-full-minus-sidebar relative`}
      tool={activeTool}
      locked={mapLock ? 'locked' : undefined}
      ref={mapContainer}
    />
  );
};
