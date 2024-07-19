"use client";
import type { MutableRefObject } from "react";
import React, { use, useEffect, useRef, useState } from "react";
import type { Map, MapLayerEventType } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_OPTIONS } from "../constants/configuration";
import { addLayer } from "../constants/layers";
import { mapEvents, useHoverFeatureIds } from "../utils/events/mapEvents";
import { MapLayerMouseEvent, MapLayerTouchEvent } from "maplibre-gl";
import { useMapStore } from "../store/mapStore";
import { BLOCK_LAYER_ID } from "../constants/layers";

export const MapComponent: React.FC = () => {
  const map: MutableRefObject<Map | null> = useRef(null);
  const mapContainer: MutableRefObject<HTMLDivElement | null> = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapStore = useMapStore();
  const hoverFeatureIds = useHoverFeatureIds();

  useEffect(() => {
    if (map.current || !mapContainer.current) return;
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_OPTIONS.style,
      center: MAP_OPTIONS.center,
      zoom: MAP_OPTIONS.zoom,
      maxZoom: MAP_OPTIONS.maxZoom,
    });
    map.current.on("load", () => {
      setMapLoaded(true);
      addLayer(map);
    });

    mapEvents.forEach((action) => {
      if (map.current) {
        map.current?.on(
          action.action as keyof MapLayerEventType,
          `${BLOCK_LAYER_ID}-hover`,
          (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
            action.handler(e, map, hoverFeatureIds);
          }
        );
        console.log(`${BLOCK_LAYER_ID}-hover`);
        console.log("added event listener " + action.action);
      }
    });

    return () => {
      mapEvents.forEach((action) => {
        map.current?.off(action.action, (e) => {
          action.handler(e, map, hoverFeatureIds);
        });
      });
    };
  }, []);

  return <div className="h-full w-full-minus-sidebar" ref={mapContainer} />;
};
