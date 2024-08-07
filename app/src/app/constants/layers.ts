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
  val.push(["==", ["feature-state", "zone"], i + 1], color);
  return val;
}, colorStyleBaseline);
ZONE_ASSIGNMENT_STYLE_DYNAMIC.push("#cecece");

// cast the above as an ExpressionSpecification
// @ts-ignore
export const ZONE_ASSIGNMENT_STYLE: ExpressionSpecification =
  ZONE_ASSIGNMENT_STYLE_DYNAMIC;

export const ZONE_ASSIGNMENT_STYLE2: ExpressionSpecification = [
  "case",
  ["==", ["feature-state", "zone"], "#dd4425"],
  "#dd4425",
  ["==", ["feature-state", "zone"], "#dc3e42"],
  "#dc3e42",
  ["==", ["feature-state", "zone"], "#dc3b5d"],
  "#dc3b5d",
  ["==", ["feature-state", "zone"], "#df3478"],
  "#df3478",
  ["==", ["feature-state", "zone"], "#cf3897"],
  "#cf3897",
  ["==", ["feature-state", "zone"], "#a144af"],
  "#a144af",
  ["==", ["feature-state", "zone"], "#8347b9"],
  "#8347b9",
  ["==", ["feature-state", "zone"], "#654dc4"],
  "#654dc4",
  ["==", ["feature-state", "zone"], "#5151cd"],
  "#5151cd",
  ["==", ["feature-state", "zone"], "#3358d4"],
  "#3358d4",
  ["==", ["feature-state", "zone"], "#0588f0"],
  "#0588f0",
  ["==", ["feature-state", "zone"], "#0797b9"],
  "#0797b9",
  ["==", ["feature-state", "zone"], "#0d9b8a"],
  "#0d9b8a",
  ["==", ["feature-state", "zone"], "#26997b"],
  "#26997b",
  ["==", ["feature-state", "zone"], "#2b9a66"],
  "#2b9a66",
  ["==", ["feature-state", "zone"], "#3e9b4f"],
  "#3e9b4f",
  ["==", ["feature-state", "zone"], "#ef5f00"],
  "#ef5f00",
  ["==", ["feature-state", "zone"], "#ffba18"],
  "#ffba18",
  ["==", ["feature-state", "zone"], "#ffdc00"],
  "#ffdc00",
  ["==", ["feature-state", "zone"], "#8c7a5e"],
  "#8c7a5e",
  ["==", ["feature-state", "zone"], "#a07553"],
  "#a07553",
  ["==", ["feature-state", "zone"], "#957468"],
  "#957468",
  ["==", ["feature-state", "zone"], "#838383"],
  "#838383",
  ["==", ["feature-state", "zone"], "#7de0cb"],
  "#7de0cb",
  ["==", ["feature-state", "zone"], "#b0e64c"],
  "#b0e64c",
  ["==", ["feature-state", "zone"], "#74daf8"],
  "#74daf8",
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
