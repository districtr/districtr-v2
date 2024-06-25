import { BLOCK_LAYER_ID, BLOCK_LAYER_SOURCE_ID } from "@/app/constants/layers";
import { MutableRefObject, useEffect } from "react";
import type { Map, MapGeoJSONFeature } from "maplibre-gl";
import { ZoneStore } from "@/app/store/zoneStore";
import { debounce } from "lodash";
const debouncedSetZoneAssignments = debounce(
  (
    zoneStoreRef: {
      setZoneAssignments: (arg0: Number, arg1: Set<string>) => void;
    },
    selectedZone: Number,
    geoids: Set<string>
  ) => {
    zoneStoreRef.setZoneAssignments(selectedZone, geoids);
  },
  1000 // 1 second
);

export const HighlightFeature = (
  features: Array<MapGeoJSONFeature> | undefined,
  map: MutableRefObject<Map | null>,
  zoneStoreRef: MutableRefObject<ZoneStore | null>,
  accumulatedGeoids: MutableRefObject<Set<string>>
) => {
  features?.forEach((feature) => {
    map.current?.setFeatureState(
      {
        source: BLOCK_LAYER_ID,
        id: feature?.id ?? undefined,
        sourceLayer: BLOCK_LAYER_SOURCE_ID,
      },
      { hover: true, zone: Number(zoneStoreRef.selectedZone) }
    );
  });

  if (features?.length) {
    features.forEach((feature) => {
      accumulatedGeoids.current.add(feature.properties?.GEOID20);
    });

    debouncedSetZoneAssignments(
      zoneStoreRef,
      zoneStoreRef.selectedZone,
      accumulatedGeoids.current
    );
  }
};

export const UnhighlightFeature = (
  map: MutableRefObject<Map | null>,
  highlightedFeature: MutableRefObject<MapGeoJSONFeature>
) => {
  // TODO: need to update this to match logic in HighlightFeature

  if (highlightedFeature.current) {
    map.current?.setFeatureState(
      {
        source: BLOCK_LAYER_ID,
        id: highlightedFeature.current ?? undefined,
        sourceLayer: BLOCK_LAYER_SOURCE_ID,
      },
      { hover: false }
    );
    // filterStoreRef.current?.setSelectedEdge(undefined);
  }
};
