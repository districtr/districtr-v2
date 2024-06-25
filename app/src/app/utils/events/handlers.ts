import { BLOCK_LAYER_ID, BLOCK_LAYER_SOURCE_ID } from "@/app/constants/layers";
import { MutableRefObject, useEffect } from "react";
import type { Map, MapGeoJSONFeature } from "maplibre-gl";
import { ZoneStore } from "@/app/store/zoneStore";
import { debounce } from "lodash";

/**
 * Debounced function to set zone assignments in the store without resetting the state every time the mouse moves (assuming onhover event).
 * @param zoneStoreRef - MutableRefObject<ZoneStore | null>, the zone store reference from zustand
 * @param selectedZone - Number, the selected zone
 * @param geoids - Set<string>, the set of geoids to assign to the selected zone
 * @returns void - but updates the zoneAssignments in the store
 */
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

/**
 * Highlight features based on hover mouseevent. called using `map.on("mousemove", "blocks-hover", ...)` pattern.
 * currently assumes zones are assigned to features on hover.
 *
 * @param features - Array of MapGeoJSONFeature from QueryRenderedFeatures
 * @param map - MutableRefObject<Map | null>, the maplibre map instance
 * @param zoneStoreRef - MutableRefObject<ZoneStore | null>, the zone store reference from zustand
 * @param accumulatedGeoids - MutableRefObject<Set<string>>, a blank set to accumulate geoids; reset every time the zone changes.
 */

export const SelectFeature = (
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
      { selected: true, zone: Number(zoneStoreRef.selectedZone) }
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

/**
 * Highlight features based on hover mouseevent. called using `map.on("mousemove", "blocks-hover", ...)` pattern.
 * @param features - Array of MapGeoJSONFeature from QueryRenderedFeatures
 * @param map - MutableRefObject<Map | null>, the maplibre map instance
 * @param hoverGeoids - MutableRefObject<Set<string>>, used to keep track of geoids that have been hovered over
 */
export const HighlightFeature = (
  features: Array<MapGeoJSONFeature> | undefined,
  map: MutableRefObject<Map | null>,
  hoverGeoids: MutableRefObject<Set<string>>
) => {
  if (features?.length) {
    if (hoverGeoids.current.size) {
      hoverGeoids.current.forEach((Id) => {
        map.current?.setFeatureState(
          {
            source: BLOCK_LAYER_ID,
            id: Id,
            sourceLayer: BLOCK_LAYER_SOURCE_ID,
          },
          { hover: false }
        );
      });
      hoverGeoids.current.clear();
    }
  }

  features?.forEach((feature) => {
    map.current?.setFeatureState(
      {
        source: BLOCK_LAYER_ID,
        id: feature?.id ?? undefined,
        sourceLayer: BLOCK_LAYER_SOURCE_ID,
      },
      { hover: true }
    );
  });

  if (features?.length) {
    features.forEach((feature) => hoverGeoids.current.add(feature?.id));
  }
};

/**
 * Unhighlight features based on mouseleave event. called using `map.on("mouseleave", "blocks-hover", ...)` pattern.
 * @param map - MutableRefObject<Map | null>, the maplibre map instance
 * @param hoverFeatureIds - MutableRefObject<Set<string>>, used to keep track of geoids that have been hovered over
 */
export const UnhighlightFeature = (
  map: MutableRefObject<Map | null>,
  hoverFeatureIds: MutableRefObject<Set<string>>
) => {
  if (hoverFeatureIds.current.size) {
    hoverFeatureIds.current.forEach((Id) => {
      map.current?.setFeatureState(
        {
          source: BLOCK_LAYER_ID,
          id: Id,
          sourceLayer: BLOCK_LAYER_SOURCE_ID,
        },
        { hover: false }
      );
    });
    hoverFeatureIds.current.clear();
  }
};
