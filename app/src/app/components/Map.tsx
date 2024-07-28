"use client";
import type { MutableRefObject } from "react";
import React, { useEffect, useRef, useState } from "react";
import type { Map } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_CENTER, MAP_TILES } from "../constants/configuration";
import { addLayer } from "../constants/layers";
import { MapLayerMouseEvent, MapLayerTouchEvent } from "maplibre-gl";
import { BLOCK_LAYER_ID } from "../constants/layers";
import { useCreateMapDocument } from "../api/apiHandlers";
import { CreateMapSession } from "../components/navigation-events";
import { useRouter } from "next/navigation";

export const MapComponent: React.FC = () => {
  const router = useRouter();
  const map: MutableRefObject<Map | null> = useRef(null);
  const mapContainer: MutableRefObject<HTMLDivElement | null> = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  useEffect(() => {
    if (map.current || !mapContainer.current) return;
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_TILES,
      center: MAP_CENTER, // starting position [lng, lat]
      zoom: 6.75, // starting zoom
      maxZoom: 18,
    });
    map.current.on("load", () => {
      setMapLoaded(true);
      addLayer(map);
    });
  }, []);

  return <div className="h-full w-full-minus-sidebar" ref={mapContainer} />;
};
