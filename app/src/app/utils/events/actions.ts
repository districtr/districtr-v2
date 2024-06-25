import { MutableRefObject, useEffect, useState, useRef } from "react";
import type { Map, MapLayerMouseEvent, MapLayerTouchEvent } from "maplibre-gl";
import { BLOCK_LAYER_ID } from "@/app/constants/layers";
import { HighlightFeature, UnhighlightFeature } from "./handlers";
import { useZoneStore } from "@/app/store/zoneStore";
import { PointLike, MapGeoJSONFeature } from "maplibre-gl";
import { debounce } from "lodash";

export const useApplyActions = (
  map: MutableRefObject<Map | null>,
  mapLoaded: boolean
) => {
  const zoneStore = useZoneStore();
  const hoverFeatureIds = useRef(new Set<string>());
  const accumulatedGeoids = useRef(new Set<string>());

  useEffect(() => {
    // clear accumulated geoids when zone changes
    accumulatedGeoids.current.clear();
  }, [zoneStore.selectedZone]);

  if (!mapLoaded) return;
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
      HighlightFeature(selectedFeatures, map, hoverFeatureIds);
    }
  );

  map.current?.on(
    "mouseleave",
    "blocks-hover",
    (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
      UnhighlightFeature(map, hoverFeatureIds);
    }
  );
};
