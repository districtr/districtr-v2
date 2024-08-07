import { ExpressionSpecification, LayerSpecification } from "maplibre-gl";
import { MutableRefObject } from "react";
import { Map } from "maplibre-gl";
import { BLOCKS_SOURCE } from "./sources";
import { color10 } from "./colors";

export const BLOCK_LAYER_ID = "blocks";
export const BLOCK_LAYER_SOURCE_ID = "co_blocks_wgs4fgb";
export const DEFAULT_PAINT_STYLE: ExpressionSpecification = [
  "case",
  ["boolean", ["feature-state", "hover"], false],
  "#FF0000",
  "#000000",
];

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

export const BLOCKS_LAYER: LayerSpecification = {
  id: BLOCK_LAYER_ID,
  source: BLOCK_LAYER_ID,
  "source-layer": BLOCK_LAYER_SOURCE_ID,
  type: "line",
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

export const BLOCKS_HOVER_LAYER: LayerSpecification = {
  id: `${BLOCK_LAYER_ID}-hover`,
  source: BLOCK_LAYER_ID,
  "source-layer": BLOCK_LAYER_SOURCE_ID,
  type: "fill",
  paint: {
    "fill-opacity": [
      "case",
      [
        "all",
        ["boolean", ["feature-state", "hover"], false],
        ["!", ["==", ["feature-state", "zone"], null]],
      ],
      0.8,
      ["boolean", ["feature-state", "hover"], false],
      0.8,
      ["!", ["==", ["feature-state", "zone"], null]],
      0.8,
      0.2,
    ],
    // @ts-ignore - this is a valid expression
    "fill-color": ZONE_ASSIGNMENT_STYLE_DYNAMIC || "#000000",
  },
};

const addLayer = (map: MutableRefObject<Map | null>) => {
  map.current?.addSource(BLOCK_LAYER_ID, BLOCKS_SOURCE);
  map.current?.addLayer(BLOCKS_LAYER);

  map.current?.addLayer(BLOCKS_HOVER_LAYER);
};

const removeLayer = (map: MutableRefObject<Map | null>) => {
  map.current?.removeLayer(BLOCK_LAYER_ID);
  map.current?.removeSource(BLOCK_LAYER_ID);
};

export { addLayer, removeLayer };
