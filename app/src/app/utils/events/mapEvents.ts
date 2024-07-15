/**
 Port over from map events declared at: https://github.com/uchicago-dsi/districtr-components/blob/2e8f9e5657b9f0fd2419b6f3258efd74ae310f32/src/Districtr/Districtr.tsx#L230
 */
// import { ViewStateChangeEvent } from "@/app/constants/types";
import type { Map, MapLayerMouseEvent, MapLayerTouchEvent } from "maplibre-gl";
import { MapStore, useMapStore } from "@/app/store/mapStore";
import { MutableRefObject } from "react";
import { PointLike } from "maplibre-gl";
import { BLOCK_LAYER_ID } from "@/app/constants/layers";
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

export const onMapClick = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MutableRefObject<Map | null>,
  mapStore: MapStore
) => {
  const bbox: [PointLike, PointLike] = [
    [e.point.x - 50, e.point.y - 50],
    [e.point.x + 50, e.point.y + 50],
  ];

  const selectedFeatures = map.current?.queryRenderedFeatures(bbox, {
    layers: [BLOCK_LAYER_ID],
  });

  SelectFeatures(selectedFeatures, map, mapStore);
};
export const onMapMouseUp = (e: MapLayerMouseEvent | MapLayerTouchEvent) => {};
export const onMapMouseDown = (
  e: MapLayerMouseEvent | MapLayerTouchEvent
) => {};
export const onMapMouseEnter = (
  e: MapLayerMouseEvent | MapLayerTouchEvent
) => {};
export const onMapMouseOver = (
  e: MapLayerMouseEvent | MapLayerTouchEvent
) => {};
export const onMapMouseLeave = (
  e: MapLayerMouseEvent | MapLayerTouchEvent
) => {};
export const onMapMouseOut = (e: MapLayerMouseEvent | MapLayerTouchEvent) => {};
export const onMapMouseMove = (
  e: MapLayerMouseEvent | MapLayerTouchEvent
) => {};
export const onMapZoom = (e: MapLayerMouseEvent | MapLayerTouchEvent) => {};
export const onMapIdle = () => {};
export const onMapMoveEnd = (e: MapLayerMouseEvent | MapLayerTouchEvent) => {};
export const onMapZoomEnd = (e: MapLayerMouseEvent | MapLayerTouchEvent) => {};

export const mapEvents = [
  { action: "click", handler: onMapClick },
  { action: "mouseup", handler: onMapMouseUp },
  { action: "mousedown", handler: onMapMouseDown },
  { action: "touchstart", handler: onMapMouseDown },
  { action: "mouseenter", handler: onMapMouseEnter },
  { action: "mouseover", handler: onMapMouseOver },
  { action: "mouseleave", handler: onMapMouseLeave },
  { action: "touchleave", handler: onMapMouseLeave },
  { action: "mouseout", handler: onMapMouseOut },
  { action: "mousemove", handler: onMapMouseMove },
  { action: "touchmove", handler: onMapMouseMove },
  { action: "zoom", handler: onMapZoom },
  { action: "idle", handler: onMapIdle },
  { action: "moveend", handler: onMapMoveEnd },
  { action: "zoomend", handler: onMapZoomEnd },
];
