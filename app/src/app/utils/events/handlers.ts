import { BLOCK_LAYER_ID, BLOCK_LAYER_SOURCE_ID } from "@/app/constants/layers";
import { MutableRefObject } from "react";
import type { Map, MapGeoJSONFeature } from "maplibre-gl";
import { debounce } from "lodash";
import { MapStore } from "@/app/store/mapStore";
/**
 * Debounced function to set zone assignments in the store without resetting the state every time the mouse moves (assuming onhover event).
 * @param zoneStoreRef - MutableRefObject<ZoneStore | null>, the zone store reference from zustand
 * @param geoids - Set<string>, the set of geoids to assign to the selected zone
 * @returns void - but updates the zoneAssignments in the store
 */
const debouncedSetZoneAssignments = debounce(
  (mapStoreRef: MapStore, selectedZone: number, geoids: Set<string>) => {
    mapStoreRef.setZoneAssignments(mapStoreRef.selectedZone, geoids);
  },
  1000 // 1 second
);

/**
 * Select features based on hover mouseevent. called using `map.on("mousemove", "blocks-hover", ...)` pattern.
 * currently assumes zones are assigned to features on hover.
 *
 * @param features - Array of MapGeoJSONFeature from QueryRenderedFeatures
 * @param map - MutableRefObject<Map | null>, the maplibre map instance
 * @param mapStoreRef - MutableRefObject<MapStore | null>, the map store reference from zustand
 */

export const SelectFeatures = (
  features: Array<MapGeoJSONFeature> | undefined,
  map: MutableRefObject<Map | null>,
  mapStoreRef: MapStore
) => {
  features?.forEach((feature) => {
    map.current?.setFeatureState(
      {
        source: BLOCK_LAYER_ID,
        id: feature?.id ?? undefined,
        sourceLayer: BLOCK_LAYER_SOURCE_ID,
      },
      { selected: true, zone: Number(mapStoreRef.selectedZone) }
    );
  });
  if (features?.length) {
    features.forEach((feature) => {
      mapStoreRef.accumulatedGeoids.add(feature.properties?.GEOID20);
    });

    debouncedSetZoneAssignments(
      mapStoreRef,
      mapStoreRef.selectedZone,
      mapStoreRef.accumulatedGeoids
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
    features.forEach((feature) => {
      if (feature?.id) {
        hoverGeoids.current.add(feature.id.toString());
      }
    });
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
