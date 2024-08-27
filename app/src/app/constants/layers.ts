import { ExpressionSpecification, LayerSpecification } from "maplibre-gl";
import { MutableRefObject } from "react";
import { Map } from "maplibre-gl";
import { getBlocksSource } from "./sources";
import { gerryDBView } from "../api/apiHandlers";
import { color10 } from "./colors";

export const BLOCK_SOURCE_ID = "blocks";
export const BLOCK_LAYER_ID = "blocks";
export const BLOCK_HOVER_LAYER_ID = `${BLOCK_LAYER_ID}-hover`;
export const DEFAULT_PAINT_STYLE: ExpressionSpecification = [
  "case",
  ["boolean", ["feature-state", "hover"], false],
  "#FF0000",
  "#000000",
];

export const LABELS_BREAK_LAYER_ID = "places_subplace";

const colorStyleBaseline: any[] = ["case"];
export const ZONE_ASSIGNMENT_STYLE_DYNAMIC = color10.reduce((val, color, i) => {
  val.push(["==", ["feature-state", "zone"], i + 1], color); // 1-indexed per mapStore.ts
  return val;
}, colorStyleBaseline);
ZONE_ASSIGNMENT_STYLE_DYNAMIC.push("#cecece");

// cast the above as an ExpressionSpecification
// @ts-ignore
export const ZONE_ASSIGNMENT_STYLE: ExpressionSpecification =
  ZONE_ASSIGNMENT_STYLE_DYNAMIC;

export function getBlocksLayerSpecification(
  sourceLayer: string,
): LayerSpecification {
  return {
    id: BLOCK_LAYER_ID,
    source: BLOCK_SOURCE_ID,
    "source-layer": sourceLayer,
    type: "line",
    layout: {
      visibility: "visible",
    },
    paint: {
      "line-opacity": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        1,
        0.8,
      ],
      "line-color": "#cecece",
    },
  };
}

export function getBlocksHoverLayerSpecification(
  sourceLayer: string,
): LayerSpecification {
  return {
    id: BLOCK_HOVER_LAYER_ID,
    source: BLOCK_SOURCE_ID,
    "source-layer": sourceLayer,
    type: "fill",
    layout: {
      visibility: "visible",
    },
    paint: {
      "fill-opacity": [
        "case",
        // if not hovered and not assigned a zone, be 0.8
        [
          "all",
          ["boolean", ["feature-state", "hover"], false],
          ["boolean", ["feature-state", "zone"], false],
        ],
        0.8,
        // if not hovered, be 0.8
        ["boolean", ["feature-state", "hover"], false],
        0.8,
        // if not assigned a zone, be 0.8
        // @ts-ignore
        ["!", ["==", ["feature-state", "zone"], null]], //< desired behavior but typerror
        0.8,
        0.2,
      ],
      "fill-color": ZONE_ASSIGNMENT_STYLE || "#000000",
    },
  };
}

const addBlockLayers = (
  map: MutableRefObject<Map | null>,
  gerryDBView: gerryDBView,
) => {
  const blockSource = getBlocksSource(gerryDBView.tiles_s3_path);
  removeBlockLayers(map);
  map.current?.addSource(BLOCK_SOURCE_ID, blockSource);
  map.current?.addLayer(
    getBlocksLayerSpecification(gerryDBView.name),
    LABELS_BREAK_LAYER_ID,
  );
  map.current?.addLayer(
    getBlocksHoverLayerSpecification(gerryDBView.name),
    LABELS_BREAK_LAYER_ID,
  );
};

export function removeBlockLayers(map: MutableRefObject<Map | null>) {
  if (map.current?.getLayer(BLOCK_LAYER_ID)) {
    map.current?.removeLayer(BLOCK_LAYER_ID);
  }
  if (map.current?.getLayer(BLOCK_HOVER_LAYER_ID)) {
    map.current?.removeLayer(BLOCK_HOVER_LAYER_ID);
  }
  if (map.current?.getSource(BLOCK_SOURCE_ID)) {
    map.current?.removeSource(BLOCK_SOURCE_ID);
  }
}

export { addBlockLayers };
