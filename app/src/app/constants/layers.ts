import { ExpressionSpecification, LayerSpecification } from "maplibre-gl";
import { MutableRefObject } from "react";
import { Map } from "maplibre-gl";
import { getBlocksSource } from "./sources";
import { gerryDBView } from "../api/apiHandlers";

export const BLOCK_SOURCE_ID = "blocks";
export const BLOCK_LAYER_ID = "blocks";
export const BLOCK_HOVER_LAYER_ID = `${BLOCK_LAYER_ID}-hover`;
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

export function getBlocksLayerSpecification(
  sourceLayer: string,
): LayerSpecification {
  return {
    id: BLOCK_LAYER_ID,
    source: BLOCK_SOURCE_ID,
    "source-layer": sourceLayer,
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
}

export function getBlocksHoverLayerSpecification(
  sourceLayer: string,
): LayerSpecification {
  return {
    id: BLOCK_HOVER_LAYER_ID,
    source: BLOCK_SOURCE_ID,
    "source-layer": sourceLayer,
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

      "fill-color": ZONE_ASSIGNMENT_STYLE || "#000000",
    },
  };
}

const addBlockLayers = (
  map: MutableRefObject<Map | null>,
  gerryDBView: gerryDBView,
) => {
  const blockSource = getBlocksSource(gerryDBView.tiles_s3_path);
  map.current?.addSource(BLOCK_SOURCE_ID, blockSource);
  map.current?.addLayer(getBlocksLayerSpecification(gerryDBView.table_name));
  map.current?.addLayer(
    getBlocksHoverLayerSpecification(gerryDBView.table_name),
  );
};

function removeBlockLayers(map: MutableRefObject<Map | null>) {
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

export { addBlockLayers, removeBlockLayers };
