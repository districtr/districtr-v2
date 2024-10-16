import { BLOCK_SOURCE_ID } from "@/app/constants/layers";
import { MutableRefObject } from "react";
import { Map, MapGeoJSONFeature } from "maplibre-gl";
import { debounce } from "lodash";
import { NullableZone, Zone } from "@/app/constants/types";
import { MapStore } from "@/app/store/mapStore";

/**
 * Debounced function to set zone assignments in the store without resetting the state every time the mouse moves (assuming onhover event).
 * @param mapStoreRef - MapStore | null, the zone store reference from zustand
 * @param geoids - Set<string>, the set of geoids to assign to the selected zone
 * @returns void - but updates the zoneAssignments and zonePopulations in the store
 */
const debouncedSetZoneAssignments = debounce(
  (mapStoreRef: MapStore, selectedZone: NullableZone, geoids: Array<string>) => {
    mapStoreRef.setZoneAssignments(selectedZone, geoids);

    const accumulatedBlockPopulations = mapStoreRef.accumulatedBlockPopulations;

    const population = Array.from(Object.values(accumulatedBlockPopulations)).reduce(
      (acc, val) => acc + Number(val),
      0,
    );
    selectedZone && mapStoreRef.setZonePopulations(selectedZone, population);
  },
  1, // 1ms debounce
);

/**
 * Select features based on given mouseEvent.
 * called using mapEvent handlers.
 *
 * @param features - Array of MapGeoJSONFeature from QueryRenderedFeatures
 * @param map - Map | null, the maplibre map instance
 * @param mapStoreRef - MutableRefObject<MapStore | null>, the map store reference from zustand
 * @returns Promise<void> - resolves after the function completes
 * Selects the features and sets the state of the map features to be selected.
 * Does not modify the store; that is done in the SelectZoneAssignmentFeatures function.
 * */
export const SelectMapFeatures = (
  features: Array<MapGeoJSONFeature> | undefined,
  map: Map | null,
  mapStoreRef: MapStore,
) => {
  if (map) {
    let { accumulatedGeoids, accumulatedBlockPopulations, activeTool } =
      mapStoreRef;
    const selectedZone =
      activeTool === "eraser" ? null : mapStoreRef.selectedZone;

    features?.forEach((feature) => {
      map.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          id: feature?.id ?? undefined,
          sourceLayer: feature.sourceLayer,
        },
        { selected: true, zone: selectedZone }
      );
    });
    if (features?.length) {
      features.forEach((feature) => {
        accumulatedGeoids.push(feature.properties?.path);
        accumulatedBlockPopulations[feature.properties?.path] =
          feature.properties?.total_pop;
      });
    }
  }
  return new Promise<void>((resolve) => {
    // Resolve the Promise after the function completes
    // this is so we can chain the function and call the next one
    resolve();
  });
};

/**
 * Select zone assignments based on selected zone and accumulated geoids.
 * called using mapEvent handlers.
 *
 * @param mapStoreRef - MutableRefObject<MapStore | null>, the map store reference from zustand
 * Selects the zone assignments and sets the state of the map features to be assigned to the selected zone.
 * */
export const SelectZoneAssignmentFeatures = (mapStoreRef: MapStore) => {
  const accumulatedGeoids = mapStoreRef.accumulatedGeoids;
  if (accumulatedGeoids?.length) {
    debouncedSetZoneAssignments(
      mapStoreRef,
      mapStoreRef.activeTool === "brush" ? mapStoreRef.selectedZone : null,
      mapStoreRef.accumulatedGeoids,
    );
  }
};

/**
 * Highlight features based on hover mouseEvent. called using `map.on("mousemove", "blocks-hover", ...)` pattern.
 * @param features - Array of MapGeoJSONFeature from QueryRenderedFeatures
 * @param map - Map | null, the maplibre map instance
 * @param hoverGeoids - MutableRefObject<Set<string>>, used to keep track of geoids that have been hovered over
 * @deprecated This function is no longer in use and will be removed in a future version.
 */
export const HighlightFeature = (
  features: Array<MapGeoJSONFeature> | undefined,
  map: Map | null,
  hoverGeoids: MutableRefObject<Set<string>>,
  sourceLayer: string,
) => {
  if (features?.length && map) {
    if (hoverGeoids.current.size) {
      hoverGeoids.current.forEach((Id) => {
        map.setFeatureState(
          {
            source: BLOCK_SOURCE_ID,
            id: Id,
            sourceLayer: sourceLayer,
          },
          { hover: false },
        );
      });
      hoverGeoids.current.clear();
    }
  }

  features?.forEach((feature) => {
    map?.setFeatureState(
      {
        source: BLOCK_SOURCE_ID,
        id: feature.id ?? undefined,
        sourceLayer: feature.sourceLayer,
      },
      { hover: true },
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
 * Un-highlight features based on mouseleave event.
 * called using `map.on("mouseleave", "blocks-hover", ...)` pattern.
 * @param map - Map | null, the maplibre map instance
 * @param hoverFeatureIds - MutableRefObject<Set<string>>, used to keep track of geoids that have been hovered over
 * @deprecated This function is no longer in use and will be removed in a future version.
 */
export const UnhighlightFeature = (
  map: Map | null,
  hoverFeatureIds: MutableRefObject<Set<string>>,
  sourceLayer: string,
) => {
  if (hoverFeatureIds.current.size) {
    hoverFeatureIds.current.forEach((Id) => {
      map?.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          id: Id,
          sourceLayer: sourceLayer,
        },
        { hover: false },
      );
    });
    hoverFeatureIds.current.clear();
  }
};

/**
 * Resets the selection status of the map to be able to clear all and start over.
 *
 * @param map - Map | null
 * @param mapStoreRef - MapStore
 */
export const ResetMapSelectState = (
  map: Map | null,
  mapStoreRef: MapStore,
  sourceLayer: string,
) => {
  if (map && Object.keys(mapStoreRef.zoneAssignments).length) {
    map.removeFeatureState({
      source: BLOCK_SOURCE_ID,
      sourceLayer: sourceLayer,
    });

    mapStoreRef.setAccumulatedGeoids([])
    // reset zoneAssignments
    mapStoreRef.resetZoneAssignments();
    // confirm the map has been reset
    mapStoreRef.setFreshMap(false);
  }
};
