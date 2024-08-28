import {
  Map,
  PointLike,
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  MapGeoJSONFeature,
} from "maplibre-gl";
import { MutableRefObject } from "react";
import { Point } from "maplibre-gl";
import { BLOCK_LAYER_ID } from "@/app/constants/layers";

/**
 * PaintEventHandler
 * A function that takes a map reference, a map event object, and a brush size.
 * @param map - MutableRefObject<Map | null>, the maplibre map instance
 * @param e - MapLayerMouseEvent | MapLayerTouchEvent, the event object
 * @param brushSize - number, the size of the brush
 */
export type PaintEventHandler = (
  map: React.MutableRefObject<Map | null>,
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  brushSize: number,
) => MapGeoJSONFeature[] | undefined;

/**
 * boxAroundPoint
 * Create a bounding box around a point on the map.
 * @param e - MapLayerMouseEvent | MapLayerTouchEvent, the event object
 * @param radius - number, the radius of the bounding box
 * @returns [PointLike, PointLike] - An array of two points representing the bounding box
 */
export const boxAroundPoint = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  radius: number,
): [PointLike, PointLike] => {
  return [
    [e.point.x - radius, e.point.y - radius],
    [e.point.x + radius, e.point.y + radius],
  ];
};

/**
 * getFeaturesInBbox
 * Get the features in a bounding box on the map.
 * @param map - MutableRefObject<Map | null>, the maplibre map instance
 * @param e - MapLayerMouseEvent | MapLayerTouchEvent, the event object
 * @param brushSize - number, the size of the brush
 * @returns MapGeoJSONFeature[] | undefined - An array of map features or undefined
 */
export const getFeaturesInBbox = (
  map: MutableRefObject<Map | null>,
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  brushSize: number,
): MapGeoJSONFeature[] | undefined => {
  const bbox = boxAroundPoint(e, brushSize);

  return map.current?.queryRenderedFeatures(bbox, {
    layers: [BLOCK_LAYER_ID],
  });
};

/**
 * mousePos
 * Get the position of the mouse on the map.
 * @param map - MutableRefObject<Map | null>, the maplibre map instance
 * @param e - MapLayerMouseEvent | MapLayerTouchEvent, the event object
 * @returns Point - The position of the mouse on the map
 */
export const mousePos = (
  map: MutableRefObject<Map | null>,
  e: MapLayerMouseEvent | MapLayerTouchEvent,
) => {
  const canvas = map.current?.getCanvasContainer();
  if (!canvas) return new Point(0, 0);
  const rect = canvas.getBoundingClientRect();
  return new Point(
    e.point.x - rect.left - canvas.clientLeft,
    e.point.y - rect.top - canvas.clientTop,
  );
};

export interface LayerVisibility {
  layerId: string;
  visibility: "none" | "visible";
}

/**
 * toggleLayerVisibility
 * This function is responsible for toggling the visibility of layers on the map.
 * It takes a map reference and an array of layer IDs to toggle.
 * Layers must already be added to the map and have the layout property "visibility"
 * set to "none" or "visible". If the layout property is not set, this functions assumes
 * the layer is not visible and will toggle visibility on.
 *
 * @param {MutableRefObject<maplibregl.Map>} mapRef - The map reference.
 * @param {string[]} layerIds - An array of layer IDs to toggle.
 * @returns {LayerVisibility[]} - An array of objects containing the layer ID and the new visibility state.
 */
export function toggleLayerVisibility(
  mapRef: MutableRefObject<maplibregl.Map | null>,
  layerIds: string[],
): LayerVisibility[] {
  const activeLayerIds = getVisibleLayers(mapRef)?.map((layer) => layer.id);
  if (!activeLayerIds) return [];

  return layerIds.map((layerId) => {
    if (activeLayerIds && activeLayerIds.includes(layerId)) {
      mapRef.current?.setLayoutProperty(layerId, "visibility", "none");
      return { layerId: layerId, visibility: "none" };
    } else {
      mapRef.current?.setLayoutProperty(layerId, "visibility", "visible");
      return { layerId: layerId, visibility: "visible" };
    }
  }, {});
}

/**
 * getVisibleLayers
 * Returning an array of visible layers on the map based on the visibility layout property.
 * i.e. it's not based on what the user actually sees.
 * @param {MutableRefObject<maplibregl.Map>} map - The map reference.
 */
export function getVisibleLayers(map: MutableRefObject<Map | null>) {
  return map.current?.getStyle().layers.filter((layer) => {
    return layer.layout?.visibility === "visible";
  });
}
