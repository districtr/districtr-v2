"use client";
import type { Map, MapLayerEventType } from "maplibre-gl";
import maplibregl, {
  MapLayerMouseEvent,
  MapLayerTouchEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as pmtiles from "pmtiles";
import type { MutableRefObject } from "react";
import React, { use, useEffect, useRef, useState } from "react";
import { useCreateMapDocument } from "../api/apiHandlers";
import { MAP_OPTIONS } from "../constants/configuration";
import { BLOCK_HOVER_LAYER_ID } from "../constants/layers";
import { useMapStore } from "../store/mapStore";
import { mapEvents, useHoverFeatureIds } from "../utils/events/mapEvents";

export const MapComponent: React.FC = () => {
  const map: MutableRefObject<Map | null> = useRef(null);
  const mapContainer: MutableRefObject<HTMLDivElement | null> = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const hoverFeatureIds = useHoverFeatureIds();
  const createMapDocument = useCreateMapDocument();

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    let protocol = new pmtiles.Protocol();
    console.log("protocol", protocol);
    maplibregl.addProtocol("pmtiles", protocol.tile);

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_OPTIONS.style,
      center: MAP_OPTIONS.center,
      zoom: MAP_OPTIONS.zoom,
      maxZoom: MAP_OPTIONS.maxZoom,
    });

    map.current.on("load", () => {
      setMapLoaded(true);
    });

    mapEvents.forEach((action) => {
      if (map.current) {
        map.current?.on(
          action.action as keyof MapLayerEventType,
          BLOCK_HOVER_LAYER_ID, // to be updated with the scale-agnostic layer id
          (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
            action.handler(e, map, hoverFeatureIds);
          },
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
    if (
      mapLoaded &&
      map.current !== null &&
      !useMapStore.getState().documentId
    ) {
      useMapStore.setState({ mapRef: map });
      createMapDocument.mutate(map.current);
    }
  }, [mapLoaded, map.current]);

  return <div className="h-full w-full-minus-sidebar" ref={mapContainer} />;
};
