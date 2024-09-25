import { ExpressionSpecification, LayerSpecification } from "maplibre-gl";
import { MutableRefObject } from "react";
import { Map } from "maplibre-gl";
import { getBlocksSource } from "./sources";
import { DocumentObject } from "../api/apiHandlers";
import { color10 } from "./colors";

export const BLOCK_SOURCE_ID = "blocks";
export const BLOCK_LAYER_ID = "blocks";
export const BLOCK_LAYER_ID_CHILD = "blocks-child";
export const BLOCK_HOVER_LAYER_ID = `${BLOCK_LAYER_ID}-hover`;
export const BLOCK_HOVER_LAYER_ID_CHILD = `${BLOCK_LAYER_ID_CHILD}-hover`;

export const INTERACTIVE_LAYERS = [
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
]

export const DEFAULT_PAINT_STYLE: ExpressionSpecification = [
  "case",
  ["boolean", ["feature-state", "hover"], false],
  "#FF0000",
  "#000000",
];

export const COUNTY_LAYER_IDS: string[] = [
  "counties_boundary",
  "counties_labels",
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
  layerId: string,
): LayerSpecification {
  return {
    id: layerId,
    source: BLOCK_SOURCE_ID,
    "source-layer": sourceLayer,
    type: "line",
    layout: {
      visibility: "visible",
    },
    filter:
      layerId === BLOCK_LAYER_ID_CHILD
        ? ["in", ["get", "path"], ["literal", []]]
        : ["!", ["in", ["get", "path"], ["literal", []]]],
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
  layerId: string,
): LayerSpecification {
  return {
    id: layerId,
    source: BLOCK_SOURCE_ID,
    "source-layer": sourceLayer,
    type: "fill",
    layout: {
      visibility: "visible",
    },
    filter:
      layerId === BLOCK_HOVER_LAYER_ID_CHILD
        ? ["in", ["get", "path"], ["literal", []]]
        : ["!", ["in", ["get", "path"], ["literal", []]]],
    paint: {
      "fill-opacity": [
        "case",
        // zone is selected and hover is true and hover is not null
        [
          "all",
          // @ts-ignore
          ["!", ["==", ["feature-state", "zone"], null]], //< desired behavior but typerror
          [
            "all",
            // @ts-ignore
            ["!", ["==", ["feature-state", "hover"], null]], //< desired behavior but typerror
            ["boolean", ["feature-state", "hover"], true],
          ],
        ],
        0.9,
        // zone is selected and hover is false, and hover is not null
        [
          "all",
          // @ts-ignore
          ["!", ["==", ["feature-state", "zone"], null]], //< desired behavior but typerror
          [
            "all",
            // @ts-ignore
            ["!", ["==", ["feature-state", "hover"], null]], //< desired behavior but typerror
            ["boolean", ["feature-state", "hover"], false],
          ],
        ],
        0.7,
        // zone is selected, fallback, regardless of hover state
        // @ts-ignore
        ["!", ["==", ["feature-state", "zone"], null]], //< desired behavior but typerror
        0.7,
        // hover is true, fallback, regardless of zone state
        ["boolean", ["feature-state", "hover"], false],
        0.6,
        0.2,
      ],
      "fill-color": ZONE_ASSIGNMENT_STYLE || "#000000",
    },
  };
}

const addBlockLayers = (
  map: MutableRefObject<Map | null>,
  mapDocument: DocumentObject,
) => {
  if (!map.current || !mapDocument.tiles_s3_path) {
    console.log("map or mapDocument not ready", mapDocument);
    return;
  }
  const blockSource = getBlocksSource(mapDocument.tiles_s3_path);
  removeBlockLayers(map);
  map.current?.addSource(BLOCK_SOURCE_ID, blockSource);
  map.current?.addLayer(
    getBlocksLayerSpecification(mapDocument.parent_layer, BLOCK_LAYER_ID),
    LABELS_BREAK_LAYER_ID,
  );
  map.current?.addLayer(
    getBlocksHoverLayerSpecification(
      mapDocument.parent_layer,
      BLOCK_HOVER_LAYER_ID,
    ),
    LABELS_BREAK_LAYER_ID,
  );
  if (mapDocument.child_layer) {
    map.current?.addLayer(
      getBlocksHoverLayerSpecification(
        mapDocument.child_layer,
        BLOCK_HOVER_LAYER_ID_CHILD,
      ),
      LABELS_BREAK_LAYER_ID,
    );
    map.current?.addLayer(
      getBlocksLayerSpecification(
        mapDocument.child_layer,
        BLOCK_LAYER_ID_CHILD,
      ),
      LABELS_BREAK_LAYER_ID,
    );
  }
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
  if (map.current?.getLayer(BLOCK_LAYER_ID_CHILD)) {
    map.current?.removeLayer(BLOCK_LAYER_ID_CHILD);
  }
  if (map.current?.getLayer(BLOCK_HOVER_LAYER_ID_CHILD)) {
    map.current?.removeLayer(BLOCK_HOVER_LAYER_ID_CHILD);
  }
}

export { addBlockLayers };
