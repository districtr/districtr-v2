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
import { BLOCK_LAYER_ID } from "../constants/layers";
import { useCreateMapDocument } from "../api/apiHandlers";
import { useMapStore } from "../store/mapStore";

export const MapComponent: React.FC = () => {
  const map: MutableRefObject<Map | null> = useRef(null);
  const mapContainer: MutableRefObject<HTMLDivElement | null> = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const hoverFeatureIds = useHoverFeatureIds();
  const createMapDocument = useCreateMapDocument();
  const { zoneAssignments, selectedZone } = useMapStore((state) => ({
    zoneAssignments: state.zoneAssignments,
    selectedZone: state.selectedZone,
  }));

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
          `${BLOCK_LAYER_ID}-hover`, // to be updated with the scale-agnostic layer id
          (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
            action.handler(e, map, hoverFeatureIds);
          }
        );
      }
    });

    return () => {
      mapEvents.forEach((action) => {
        map.current?.off(action.action, (e) => {
          action.handler(e, map, hoverFeatureIds);
        });
      });
    };
  });

  useEffect(() => {
    // create a map document if the map is loaded and the uuid is not set via url
    if (mapLoaded && map.current && !useMapStore.getState().uuid) {
      createMapDocument.mutate(map.current);
    }
  }, [mapLoaded, map.current]);

  return <div className="h-full w-full-minus-sidebar" ref={mapContainer} />;
};
