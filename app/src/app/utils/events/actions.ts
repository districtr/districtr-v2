import { MutableRefObject, useRef } from "react";
import type { Map, MapLayerMouseEvent, MapLayerTouchEvent } from "maplibre-gl";
import { BLOCK_LAYER_ID } from "@/app/constants/layers";
import { HighlightFeature } from "./handlers";
import { useZoneStore } from "@/app/store/zoneStore";
import { PointLike } from "maplibre-gl";
import * as duckdb from "@duckdb/duckdb-wasm";

export const useApplyActions = (
  map: MutableRefObject<Map | null>,
  mapLoaded: boolean,
  db: MutableRefObject<duckdb.AsyncDuckDB | null>,
) => {
  const zoneStore = useZoneStore();

  // TODO: ensure this is set and reset properly- for the demo
  // i'm not sure that it's being set or reset properly
  const accumulatedGeoids = useRef(new Set<string>());

  map.current?.on(
    "mousemove",
    "blocks-hover",
    (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
      const bbox: [PointLike, PointLike] = [
        [e.point.x - 50, e.point.y - 50],
        [e.point.x + 50, e.point.y + 50],
      ];

      const selectedFeatures = map.current?.queryRenderedFeatures(bbox, {
        layers: [BLOCK_LAYER_ID],
      });
      HighlightFeature(selectedFeatures, map, zoneStore, accumulatedGeoids, db);
    },
  );
};
