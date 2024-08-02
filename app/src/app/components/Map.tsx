"use client";
import type { Map, MapLayerEventType } from "maplibre-gl";
import maplibregl, {
  MapLayerMouseEvent,
  MapLayerTouchEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import type { MutableRefObject } from "react";
import React, { useEffect, useRef, useState } from "react";
import { MAP_OPTIONS } from "../constants/configuration";
import {
  mapEvents,
  useHoverFeatureIds,
  handleResetMapSelectState,
} from "../utils/events/mapEvents";
import { useCreateMapDocument } from "../api/apiHandlers";
import { BLOCK_HOVER_LAYER_ID } from "../constants/layers";
import { useRouter, usePathname } from "next/navigation";
import { useMapStore } from "../store/mapStore";

export const MapComponent: React.FC = () => {
  const router = useRouter();
  const map: MutableRefObject<Map | null> = useRef(null);
  const mapContainer: MutableRefObject<HTMLDivElement | null> = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const hoverFeatureIds = useHoverFeatureIds();
  const createMapDocument = useCreateMapDocument();

  const { freshMap, setFreshMap } = useMapStore((state) => ({
    freshMap: state.freshMap,
    setFreshMap: state.setFreshMap,
  }));

  useEffect(() => {
    let protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    return () => {
      maplibregl.removeProtocol("pmtiles");
    };
  }, []);

  const setRouter = useMapStore((state) => state.setRouter);
  const setPathname = useMapStore((state) => state.setPathname);
  const pathname = usePathname();

  useEffect(() => {
    setRouter(router);
    setPathname(pathname);
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
    });

    mapEvents.forEach((action) => {
      if (map.current) {
        map.current?.on(
          action.action as keyof MapLayerEventType,
          BLOCK_HOVER_LAYER_ID, // to be updated with the scale-agnostic layer id
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
    if (
      mapLoaded &&
      map.current !== null &&
      !useMapStore.getState().documentId
    ) {
      useMapStore.setState({ mapRef: map });
      createMapDocument.mutate(map.current);
    }
  }, [mapLoaded, map.current]);

  useEffect(() => {
    if (mapLoaded && map.current) {
      handleResetMapSelectState(map);
    }
  }, [mapLoaded, map.current, freshMap]);

  return <div className="h-full w-full-minus-sidebar" ref={mapContainer} />;
};
