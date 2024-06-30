import { MutableRefObject, useRef } from "react";
import type {
  Map as MaplibreMap,
  MapLayerMouseEvent,
  MapLayerTouchEvent,
} from "maplibre-gl";
import { BLOCK_LAYER_ID, PRECINCT_LAYER_ID } from "@/app/constants/layers";
import {
  HighlightFeature,
  SelectFeatures,
  UnhighlightFeature,
} from "./handlers";
import { useZoneStore } from "@/app/store/zoneStore";
import { PointLike } from "maplibre-gl";
import { booleanIntersects } from "@turf/boolean-intersects";

export const useApplyActions = (
  map: MutableRefObject<MaplibreMap | null>,
  mapLoaded: boolean
) => {
  const zoneStore = useZoneStore();
  const hoverFeatureIds = useRef(new Set<string>());

  if (!mapLoaded) return;
  map.current?.on(
    "mousemove",
    "precincts-hover",
    (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
      const bbox: [PointLike, PointLike] = [
        [e.point.x - 50, e.point.y - 50],
        [e.point.x + 50, e.point.y + 50],
      ];

      const selectedFeatures = map.current?.queryRenderedFeatures(bbox, {
        layers: [PRECINCT_LAYER_ID],
      });
      HighlightFeature(selectedFeatures, map, hoverFeatureIds);
    }
  );

  map.current?.on(
    "mouseleave",
    "precincts-hover",
    (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
      UnhighlightFeature(map, hoverFeatureIds);
    }
  );

  map.current?.on(
    "click",
    "precincts-hover",
    (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
      const bbox: [PointLike, PointLike] = [
        [e.point.x - 50, e.point.y - 50],
        [e.point.x + 50, e.point.y + 50],
      ];

      const selectedBlockFeatures = map.current?.queryRenderedFeatures(bbox, {
        layers: [BLOCK_LAYER_ID],
      });

      const selectedPrecinctFeatures = map.current?.queryRenderedFeatures(
        bbox,
        {
          layers: [PRECINCT_LAYER_ID],
        }
      );

      // deduplicate the features
      if (selectedBlockFeatures?.length && selectedPrecinctFeatures?.length) {
        const uniqueBlockFeatures = [
          ...new Map(
            selectedBlockFeatures.map((item) => [item["id"], item])
          ).values(),
        ];
        // console.log(uniqueBlockFeatures);
        const uniquePrecinctFeatures = [
          ...new Map(
            selectedPrecinctFeatures.map((item) => [item["id"], item])
          ).values(),
        ];

        // first test - intersection of the hovered precincts and the selected blocks
        // if blocks intersect precincts, select the blocks
        const selectedFeatures = uniqueBlockFeatures.filter((block) =>
          uniquePrecinctFeatures.some((precinct) =>
            booleanIntersects(block, precinct)
          )
        );
        SelectFeatures(selectedFeatures, map, zoneStore);
        // console.log(selectedFeatures);
      }
    }
  );
};
