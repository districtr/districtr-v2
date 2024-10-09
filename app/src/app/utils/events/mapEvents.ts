/**
 Port over from map events declared at: https://github.com/uchicago-dsi/districtr-components/blob/2e8f9e5657b9f0fd2419b6f3258efd74ae310f32/src/Districtr/Districtr.tsx#L230
 */
"use client";
import type {
  Map as MapLibreMap,
  MapLayerMouseEvent,
  MapLayerTouchEvent,
} from "maplibre-gl";
import { useMapStore } from "@/app/store/mapStore";
import { MutableRefObject } from "react";
import { SelectMapFeatures, SelectZoneAssignmentFeatures } from "./handlers";
import { ResetMapSelectState } from "@/app/utils/events/handlers";
import { INTERACTIVE_LAYERS } from "@/app/constants/layers";

/*
MapEvent handling; these functions are called by the event listeners in the MapComponent
*/

/**
 * What happens when the map is clicked on; incomplete implementation
 * @param e - MapLayerMouseEvent | MapLayerTouchEvent, the event object
 * @param map - MutableRefObject<Map | null>, the maplibre map instance
 */
export const handleMapClick = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<MapLibreMap | null>
) => {
  const mapStore = useMapStore.getState();
  const activeTool = mapStore.activeTool;
  const sourceLayer = mapStore.mapDocument?.parent_layer;

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
  map: MutableRefObject<MapLibreMap | null>
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
  map: MutableRefObject<MapLibreMap | null>
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
  map: MutableRefObject<MapLibreMap | null>
) => {};

export const handleMapMouseOver = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<MapLibreMap | null>
) => {};

export const handleMapMouseLeave = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<MapLibreMap | null>
) => {
  const mapStore = useMapStore.getState();
  const activeTool = mapStore.activeTool;
  const sourceLayer = mapStore.mapDocument?.parent_layer;
  const setHoverFeatures = mapStore.setHoverFeatures;
  setHoverFeatures([]);
};

export const handleMapMouseOut = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<MapLibreMap | null>
) => {
};

export const handleMapMouseMove = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<MapLibreMap | null>
) => {
  const mapStore = useMapStore.getState();
  const activeTool = mapStore.activeTool;
  const setHoverFeatures = mapStore.setHoverFeatures;
  const isPainting = mapStore.isPainting;
  const sourceLayer = mapStore.mapDocument?.parent_layer;
  const selectedFeatures = mapStore.paintFunction(map, e, mapStore.brushSize);
  const isBrushingTool = sourceLayer && ["brush", "eraser"].includes(activeTool)
  if (isBrushingTool) {
    setHoverFeatures(selectedFeatures);
  }

  if (isBrushingTool && isPainting) {
    // selects in the map object; the store object
    // is updated in the mouseup event
    SelectMapFeatures(selectedFeatures, map, mapStore);
  }
};

export const handleMapZoom = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<MapLibreMap | null>
) => {};

export const handleMapIdle = () => {};

export const handleMapMoveEnd = () => {};

export const handleMapZoomEnd = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<MapLibreMap | null>
) => {};

export const handleResetMapSelectState = (
  map: MutableRefObject<MapLibreMap | null>
) => {
  const mapStore = useMapStore.getState();
  const sourceLayer = mapStore.mapDocument?.parent_layer;
  if (sourceLayer) {
    ResetMapSelectState(map, mapStore, sourceLayer);
  } else {
    console.error("No source layer selected");
  }
};

export const handleMapContextMenu = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<MapLibreMap | null>
) => {
  const mapStore = useMapStore.getState();
  if (mapStore.activeTool !== 'pan') {
    return
  }
  e.preventDefault();
  const setHoverFeatures = mapStore.setHoverFeatures;
  const sourceLayer = mapStore.mapDocument?.parent_layer;
  // Selects from the hover layers instead of the points
  // Otherwise, its hard to select precisely
  const selectedFeatures = mapStore.paintFunction(
    map,
    e,
    0,
    INTERACTIVE_LAYERS
  );
  if (!selectedFeatures?.length || !map.current || !sourceLayer) return;

  setHoverFeatures(selectedFeatures.slice(0, 1));

  const handleClose = () => {
    mapStore.setContextMenu(null);
    setHoverFeatures([]);
  };

  map.current.once("movestart", handleClose);

  mapStore.setContextMenu({
    x: e.point.x,
    y: e.point.y,
    data: selectedFeatures[0],
    close: handleClose,
  });
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
  { action: "contextmenu", handler: handleMapContextMenu },
];
