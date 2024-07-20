/**
 Port over from map events declared at: https://github.com/uchicago-dsi/districtr-components/blob/2e8f9e5657b9f0fd2419b6f3258efd74ae310f32/src/Districtr/Districtr.tsx#L230
 */
import type { Map, MapLayerMouseEvent, MapLayerTouchEvent } from "maplibre-gl";
import { useMapStore } from "@/app/store/mapStore";
import { MutableRefObject, useRef } from "react";
import { BLOCK_LAYER_ID } from "@/app/constants/layers";
import { boxAroundPoint } from "../helpers";
import React from "react";

import { HighlightFeature, SelectFeatures } from "./handlers";

export const userMovedMouse = (
  e: MapLayerMouseEvent | MapLayerTouchEvent
) => {};

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

  if (activeTool === "brush" || activeTool === "eraser") {
    const bbox = boxAroundPoint(e, mapStore.brushSize);

    const selectedFeatures = map.current?.queryRenderedFeatures(bbox, {
      layers: [BLOCK_LAYER_ID],
    });

    if (activeTool === "brush") {
      SelectFeatures(selectedFeatures, map, mapStore);
    } else if (activeTool === "eraser") {
      // erase features
      // TODO: implement eraser
    }
  } else {
    // tbd, for pan mode - is there an info mode on click?
  }
};

export const handleMapMouseUp = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  hoverFeatureIds: React.MutableRefObject<Set<string>>
) => {};

export const handleMapMouseDown = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  hoverFeatureIds: React.MutableRefObject<Set<string>>
) => {
  const mapStore = useMapStore.getState();
  const activeTool = mapStore.activeTool;
  if (activeTool === "pan") {
    return;
  } else if (activeTool === "brush" || activeTool === "eraser") {
    if (activeTool === "brush") {
      /* i think we would tally all the features that are dragged over,
       * and then on mouseup, we would assign them to the selected zone
       **/
      userMovedMouse(e);
      return;
    }
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
) => {};

export const handleMapMouseOut = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  hoverFeatureIds: React.MutableRefObject<Set<string>>
) => {};

export const handleMapMouseMove = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  hoverFeatureIds: React.MutableRefObject<Set<string>>
) => {
  const mapStore = useMapStore.getState();
  const brushSize = mapStore.brushSize;
  const bbox = boxAroundPoint(e, brushSize);
  const selectedFeatures = map.current?.queryRenderedFeatures(bbox, {
    layers: [BLOCK_LAYER_ID],
  });
  // TODO: refer to logic in reducer; this is a v2 test implementation
  HighlightFeature(selectedFeatures, map, hoverFeatureIds);
};

export const handleMapZoom = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  hoverFeatureIds: React.MutableRefObject<Set<string>>
) => {};

export const handleMapIdle = () => {};
export const handleMapMoveEnd = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>
) => {};

export const handleMapZoomEnd = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  hoverFeatureIds: React.MutableRefObject<Set<string>>
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
