import { MutableRefObject, useRef } from "react";
import type { Map, MapLayerMouseEvent, MapLayerTouchEvent } from "maplibre-gl";
import { BLOCK_LAYER_ID } from "@/app/constants/layers";
import {
  HighlightFeature,
  SelectFeatures,
  UnhighlightFeature,
} from "./handlers";
import { useZoneStore } from "@/app/store/zoneStore";
import { PointLike } from "maplibre-gl";
import { mapEvents } from "./mapEvents";

export const useApplyActions = (
  map: MutableRefObject<Map | null>,
  mapLoaded: boolean
) => {
  const zoneStore = useZoneStore();
  const hoverFeatureIds = useRef(new Set<string>());

  if (!mapLoaded) return;

  // might do a thing where we connect the action here to the store on a per-event type level
  // so map.on('click', 'blocks-hover', (e) => { zoneStore.updateAction(e) })

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

  map.current?.on(
    "click",
    "blocks-hover",
    (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
      const bbox: [PointLike, PointLike] = [
        [e.point.x - 50, e.point.y - 50],
        [e.point.x + 50, e.point.y + 50],
      ];

      const selectedFeatures = map.current?.queryRenderedFeatures(bbox, {
        layers: [BLOCK_LAYER_ID],
      });

      SelectFeatures(selectedFeatures, map, zoneStore);
    }
  );

  mapEvents.forEach((action) => {
    console.log(action.action, action.handler);
    map.current?.on(
      action.action,
      (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
        action.handler(e, map.current, zoneStore);
      }
    );
  });
};
