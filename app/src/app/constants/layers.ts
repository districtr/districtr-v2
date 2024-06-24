import { ExpressionSpecification, LayerSpecification } from "maplibre-gl";
import { MutableRefObject } from "react";
import { Map } from "maplibre-gl";
import { BLOCKS_SOURCE } from "./sources";

export const BLOCK_LAYER_ID = "blocks";
export const BLOCK_LAYER_SOURCE_ID = "co_blocks_wgs4fgb";
export const DEFAULT_PAINT_STYLE: ExpressionSpecification = [
  "case",
  ["boolean", ["feature-state", "hover"], false],
  "#FF0000",
  "#000000",
];

export const ZONE_ASSIGNMENT_STYLE: ExpressionSpecification = [
  // based on zone feature state, set fill color
  "case",
  ["==", ["feature-state", "zone"], 1],
  "#0099cd",
  ["==", ["feature-state", "zone"], 2],
  "#ffca5d",
  ["==", ["feature-state", "zone"], 3],
  "#00cd99",
  "#cecece",
];

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
      ["boolean", ["feature-state", "hover"], false],
      0.8,
      0.2,
    ],

    "fill-color": ZONE_ASSIGNMENT_STYLE, //"#ff00ff",
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
