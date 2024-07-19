/**
 Port over from map events declared at: https://github.com/uchicago-dsi/districtr-components/blob/2e8f9e5657b9f0fd2419b6f3258efd74ae310f32/src/Districtr/Districtr.tsx#L230
 */
// import { ViewStateChangeEvent } from "@/app/constants/types";
import type { Map, MapLayerMouseEvent, MapLayerTouchEvent } from "maplibre-gl";
import { MapStore, useMapStore } from "@/app/store/mapStore";
import { MutableRefObject, useRef } from "react";
import { BLOCK_LAYER_ID } from "@/app/constants/layers";
import { boxAroundPoint } from "../helpers";
import React from "react";

import {
  HighlightFeature,
  SelectFeatures,
  UnhighlightFeature,
} from "./handlers";

export const userMovedMouse = (e: MapLayerMouseEvent) => {};

export const handleMapClick = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {
  const bbox = boxAroundPoint(e, mapStore.brushSize);
  console.log("you clicked me!");
  const selectedFeatures = map.current?.queryRenderedFeatures(bbox, {
    layers: [BLOCK_LAYER_ID],
  });
  // TODO: refer to logic in reducer and above; this is a v2 test implementation
  SelectFeatures(selectedFeatures, map, mapStore);
};
export const handleMapMouseUp = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {};
export const handleMapMouseDown = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {};
export const handleMapMouseEnter = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {};
export const handleMapMouseOver = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {};
export const handleMapMouseLeave = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {};
export const handleMapMouseOut = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {};
export const handleMapMouseMove = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore,
  hoverFeatureIds: React.MutableRefObject<Set<string>>
) => {
  // highlight features
  //   const hoverFeatureIds = useRef(new Set<string>());
  const bbox = boxAroundPoint(e, 50);
  const selectedFeatures = map.current?.queryRenderedFeatures(bbox, {
    layers: [BLOCK_LAYER_ID],
  });
  // TODO: refer to logic in reducer; this is a v2 test implementation
  HighlightFeature(selectedFeatures, map, hoverFeatureIds);
};
export const handleMapZoom = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {};
export const handleMapIdle = () => {};
export const handleMapMoveEnd = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {};
export const handleMapZoomEnd = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {};

export const useHoverFeatureIds = () => {
  const hoverFeatureIds = useRef(new Set<string>());
  return hoverFeatureIds;
};

export const mapEvents = [
  { action: "click", handler: handleMapClick },
  { action: "mouseup", handler: handleMapMouseUp },
  { action: "mousedown", handler: handleMapMouseDown },
  { action: "touchstart", handler: handleMapMouseDown },
  { action: "mouseenter", handler: handleMapMouseEnter },
  { action: "mouseover", handler: handleMapMouseOver },
  { action: "mouseleave", handler: handleMapMouseLeave },
  { action: "touchleave", handler: handleMapMouseLeave },
  { action: "mouseout", handler: handleMapMouseOut },
  { action: "mousemove", handler: handleMapMouseMove },
  { action: "touchmove", handler: handleMapMouseMove },
  { action: "zoom", handler: handleMapZoom },
  { action: "idle", handler: handleMapIdle },
  { action: "moveend", handler: handleMapMoveEnd },
  { action: "zoomend", handler: handleMapZoomEnd },
];
