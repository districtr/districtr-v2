"use client";
import type { MutableRefObject } from "react";
import React, { useEffect, useRef, useState } from "react";
import type { Map } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_OPTIONS, MAP_CENTER, MAP_TILES } from "../constants/configuration";
import { addLayer } from "../constants/layers";
import { useApplyActions } from "../utils/events/actions";

export const MapComponent: React.FC = () => {
  const map: MutableRefObject<Map | null> = useRef(null);
  const mapContainer: MutableRefObject<HTMLDivElement | null> = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  useApplyActions(map, mapLoaded);
  useEffect(() => {
    if (map.current || !mapContainer.current) return;
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_TILES,
      center: MAP_OPTIONS.center, // starting position [lng, lat]
      zoom: MAP_OPTIONS.zoom, // starting zoom
      maxZoom: MAP_OPTIONS.maxZoom,
    });
    map.current.on("load", () => {
      setMapLoaded(true);
      addLayer(map);
    });
  }, []);

  return <div className="h-full w-full-minus-sidebar" ref={mapContainer} />;
};
