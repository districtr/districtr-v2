/**
 Port over from map events declared at: https://github.com/uchicago-dsi/districtr-components/blob/2e8f9e5657b9f0fd2419b6f3258efd74ae310f32/src/Districtr/Districtr.tsx#L230
 */
"use client";
import type { Map, MapLayerMouseEvent, MapLayerTouchEvent } from "maplibre-gl";
import { useMapStore } from "@/app/store/mapStore";
import { MutableRefObject, useRef } from "react";
import React from "react";
import {
  HighlightFeature,
  SelectMapFeatures,
  SelectZoneAssignmentFeatures,
  UnhighlightFeature,
} from "./handlers";
import { ResetMapSelectState } from "@/app/utils/events/handlers";

/*
MapEvent handling; these functions are called by the event listeners in the MapComponent
*/

/**
 * What happens when the map is clicked on; incomplete implementation
 * @param e - MapLayerMouseEvent | MapLayerTouchEvent, the event object
 * @param map - MutableRefObject<Map | null>, the maplibre map instance
 * @param hoverFeatureIds - React.MutableRefObject<Set<string>>, used to keep track of geoids that have been hovered over
 */
export const handleMapClick = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  hoverFeatureIds: React.MutableRefObject<Set<string>>
) => {
  const mapStore = useMapStore.getState();
  const activeTool = mapStore.activeTool;
  const sourceLayer = mapStore.selectedLayer?.name;

  if (activeTool === "brush" || activeTool === "eraser") {
    const selectedFeatures = mapStore.paintFunction(map, e, mapStore.brushSize);

    if (sourceLayer) {
      // select on both the map object and the store
      SelectMapFeatures(selectedFeatures, map, mapStore).then(() => {
        SelectZoneAssignmentFeatures(mapStore);
      });
    }
  } else {
    // tbd, for pan mode - is there an info mode on click?
  }
};

export const handleMapMouseUp = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  hoverFeatureIds: React.MutableRefObject<Set<string>>
) => {
  const mapStore = useMapStore.getState();
  const activeTool = mapStore.activeTool;
  const isPainting = mapStore.isPainting;

  if ((activeTool === "brush" || activeTool === "eraser") && isPainting) {
    // set isPainting to false
    mapStore.setIsPainting(false);
    SelectZoneAssignmentFeatures(mapStore);
  }
};

export const handleMapMouseDown = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  hoverFeatureIds: React.MutableRefObject<Set<string>>
) => {
  const mapStore = useMapStore.getState();
  const activeTool = mapStore.activeTool;

  if (activeTool === "pan") {
    // enable drag pan
    map.current?.dragPan.enable();
  } else if (activeTool === "brush" || activeTool === "eraser") {
    // disable drag pan
    map.current?.dragPan.disable();
    mapStore.setIsPainting(true);
  }
};

export const handleMapMouseEnter = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  hoverFeatureIds: React.MutableRefObject<Set<string>>
) => {};

export const handleMapMouseOver = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  hoverFeatureIds: React.MutableRefObject<Set<string>>
) => {};

export const handleMapMouseLeave = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  hoverFeatureIds: React.MutableRefObject<Set<string>>
) => {
  const mapStore = useMapStore.getState();
  const activeTool = mapStore.activeTool;
  const sourceLayer = mapStore.selectedLayer?.name;
  if (
    sourceLayer &&
    hoverFeatureIds.current.size &&
    (activeTool === "brush" || activeTool === "eraser")
  ) {
    UnhighlightFeature(map, hoverFeatureIds, sourceLayer);
  }
};

export const handleMapMouseOut = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  hoverFeatureIds: React.MutableRefObject<Set<string>>
) => {
  // console.log("mouse out");
};

export const handleMapMouseMove = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  hoverFeatureIds: React.MutableRefObject<Set<string>>
) => {
  const mapStore = useMapStore.getState();
  const activeTool = mapStore.activeTool;
  const isPainting = mapStore.isPainting;
  const sourceLayer = mapStore.selectedLayer?.name;
  const selectedFeatures = mapStore.paintFunction(map, e, mapStore.brushSize);
  if (sourceLayer && (activeTool === "brush" || activeTool === "eraser")) {
    HighlightFeature(selectedFeatures, map, hoverFeatureIds, sourceLayer);
  }
  if (
    (activeTool === "brush" || activeTool === "eraser") &&
    isPainting &&
    sourceLayer
  ) {
    // selects in the map object; the store object
    // is updated in the mouseup event
    SelectMapFeatures(selectedFeatures, map, mapStore);
  }
};

export const handleMapZoom = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  hoverFeatureIds: React.MutableRefObject<Set<string>>
) => {};

export const handleMapIdle = () => {};

export const handleMapMoveEnd = () => {};

export const handleMapZoomEnd = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  hoverFeatureIds: React.MutableRefObject<Set<string>>
) => {};

export const handleResetMapSelectState = (
  map: MutableRefObject<Map | null>
) => {
  const mapStore = useMapStore.getState();
  const sourceLayer = mapStore.selectedLayer?.name;
  if (sourceLayer) {
    ResetMapSelectState(map, mapStore, sourceLayer);
  } else {
    console.error("No source layer selected");
  }
};

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
