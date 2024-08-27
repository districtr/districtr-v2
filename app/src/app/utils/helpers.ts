import {
  Map,
  PointLike,
  MapLayerMouseEvent,
  MapLayerTouchEvent,
} from "maplibre-gl";
import { MutableRefObject } from "react";
import { Point } from "maplibre-gl";
export const boxAroundPoint = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  radius: number,
): [PointLike, PointLike] => {
  return [
    [e.point.x - radius, e.point.y - radius],
    [e.point.x + radius, e.point.y + radius],
  ];
};

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
 */
export function toggleLayerVisibility(
  mapRef: MutableRefObject<maplibregl.Map>,
  layerIds: string[],
): LayerVisibility[] {
  const activeLayerIds = getVisibleLayers(mapRef).map((layer) => layer.id);
  return layerIds.map((layerId) => {
    if (activeLayerIds && activeLayerIds.includes(layerId)) {
      mapRef.current.setLayoutProperty(layerId, "visibility", "none");
      return { layerId: layerId, visibility: "none" };
    } else {
      mapRef.current.setLayoutProperty(layerId, "visibility", "visible");
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
export function getVisibleLayers(map: MutableRefObject<Map>) {
  return map.current?.getStyle().layers.filter((layer) => {
    return layer.layout?.visibility === "visible";
  });
}
