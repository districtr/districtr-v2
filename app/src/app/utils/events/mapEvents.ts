/**
 Port over from map events declared at: https://github.com/uchicago-dsi/districtr-components/blob/2e8f9e5657b9f0fd2419b6f3258efd74ae310f32/src/Districtr/Districtr.tsx#L230
 */
// import { ViewStateChangeEvent } from "@/app/constants/types";
import type { Map, MapLayerMouseEvent, MapLayerTouchEvent } from "maplibre-gl";
import { MapStore, useMapStore } from "@/app/store/mapStore";
import { MutableRefObject, useRef } from "react";
import { PointLike } from "maplibre-gl";
import { BLOCK_LAYER_ID } from "@/app/constants/layers";
import { boxAroundPoint } from "../helpers";

import {
  HighlightFeature,
  SelectFeatures,
  UnhighlightFeature,
} from "./handlers";

export const userMovedMouse = (e: MapLayerMouseEvent) => {
  // this is like a drag and paint event
  // https://github.com/uchicago-dsi/districtr-components/blob/2e8f9e5657b9f0fd2419b6f3258efd74ae310f32/src/Districtr/reducers/districtrReducer.ts#L415
  //   case 'user_moved_mouse': {
  //     const threshold = state.brushSize / action.payload.offsetFactor
  //     const distance = action.payload.distance
  //     if (distance < threshold) {
  //       return {
  //         ...state
  //       }
  //     }
  //     const interactiveLayer = state.mapboxMap.getLayer(state.interactiveLayerIds[state.activeInteractiveLayer])
  //     if (!interactiveLayer) {
  //       return {
  //         ...state
  //       }
  //     }
  //     let features = getHoveredFeatures(action.payload.point, state.brushSize, state.mapboxMap, [interactiveLayer.id])
  //     if (state.hoveredFeatures.length > 0) {
  //       removeHoveredFeatures(state.mapboxMap, state.hoveredFeatures, interactiveLayer)
  //     }
  //     if (state.coloring) {
  //       if (state.paintByCounty) {
  //         const countyGEOIDs = new Set()
  //         features.forEach((feature) => {
  //           const geoid = feature.properties.GEOID20
  //           const countyGEOID = geoid.slice(0, 5)
  //           countyGEOIDs.add(countyGEOID)
  //         })
  //         let shouldPaint = false
  //         // block just checks whether the county Geoid is already painted?
  //         for (const countyGEOID of countyGEOIDs) {
  //           if (!state.paintedCountyGEOIDs.has(countyGEOID)) {
  //             shouldPaint = true
  //             state.paintedCountyGEOIDs.add(countyGEOID)
  //           }
  //         }
  //         if (shouldPaint && countyGEOIDs.size > 0) {
  //           //@ts-ignore
  //           const countyFeatures = state.mapboxMap.queryRenderedFeatures({
  //             //@ts-ignore
  //             layers: [interactiveLayer.id],
  //             filter: ['match', ['slice', ['get', 'GEOID20'], 0, 5], [...countyGEOIDs], true, false]
  //           })
  //           features = countyFeatures
  //         }
  //       }
  //       const results = colorFeatures(
  //         state.mapboxMap,
  //         features,
  //         interactiveLayer,
  //         state.activeUnit,
  //         state.units,
  //         state.activeTool,
  //         state.geometryKey,
  //         state.featureKey,
  //         state.columnKeys,
  //         state.unitAssignments,
  //         state.unitPopulations,
  //         state.unitColumnPopulations,
  //         state.lockedUnits
  //       )
  //       if (results) {
  //         return {
  //           ...state,
  //           unitAssignments: results.unitAssignments,
  //           unitPopulations: results.unitPopulations,
  //           unitColumnPopulations: results.unitColumnPopulations,
  //           units: results.units,
  //           hoveredFeatures: results.hoveredFeatures
  //         }
  //       }
  //       return {
  //         ...state
  //       }
  //     }
  //     if (state.activeTool === 'brush' || state.activeTool === 'eraser') {
  //       if (!interactiveLayer) {
  //         return {
  //           ...state
  //         }
  //       }
  //       if (features.length > 0) {
  //         features.forEach((feature) => {
  //           state.mapboxMap.setFeatureState(
  //             {
  //               // @ts-ignore
  //               source: interactiveLayer.source,
  //               // @ts-ignore
  //               sourceLayer: interactiveLayer.sourceLayer,
  //               id: feature.id
  //             },
  //             {
  //               ...feature.state,
  //               hover: true
  //             }
  //           )
  //         })
  //       }
  //       return {
  //         ...state,
  //         hoveredFeatures: features
  //       }
  //     } else {
  //       return {
  //         ...state
  //       }
  //     }
  //   }
};

export const useOnMapClick = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {
  const bbox = boxAroundPoint(e.point, mapStore.brushSize);

  const selectedFeatures = map.current?.queryRenderedFeatures(bbox, {
    layers: [BLOCK_LAYER_ID],
  });
  // TODO: refer to logic in reducer and above; this is a v2 test implementation
  SelectFeatures(selectedFeatures, map, mapStore);
};
export const useOnMapMouseUp = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {};
export const useOnMapMouseDown = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {};
export const useOnMapMouseEnter = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {};
export const useOnMapMouseOver = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {};
export const useOnMapMouseLeave = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {};
export const useOnMapMouseOut = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {};
export const useOnMapMouseMove = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {
  // highlight features
  const hoverFeatureIds = useRef(new Set<string>());
  const bbox = boxAroundPoint(e.point, 50);

  const selectedFeatures = map.current?.queryRenderedFeatures(bbox, {
    layers: [BLOCK_LAYER_ID],
  });
  // TODO: refer to logic in reducer; this is a v2 test implementation
  HighlightFeature(selectedFeatures, map, hoverFeatureIds);
};
export const useOnMapZoom = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {};
export const useOnMapIdle = () => {};
export const useOnMapMoveEnd = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {};
export const useOnMapZoomEnd = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {};

export const mapEvents = [
  { action: "click", handler: useOnMapClick },
  { action: "mouseup", handler: useOnMapMouseUp },
  { action: "mousedown", handler: useOnMapMouseDown },
  { action: "touchstart", handler: useOnMapMouseDown },
  { action: "mouseenter", handler: useOnMapMouseEnter },
  { action: "mouseover", handler: useOnMapMouseOver },
  { action: "mouseleave", handler: useOnMapMouseLeave },
  { action: "touchleave", handler: useOnMapMouseLeave },
  { action: "mouseout", handler: useOnMapMouseOut },
  { action: "mousemove", handler: useOnMapMouseMove },
  { action: "touchmove", handler: useOnMapMouseMove },
  { action: "zoom", handler: useOnMapZoom },
  { action: "idle", handler: useOnMapIdle },
  { action: "moveend", handler: useOnMapMoveEnd },
  { action: "zoomend", handler: useOnMapZoomEnd },
];
