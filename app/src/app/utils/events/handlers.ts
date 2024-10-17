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
  (mapStoreRef: MapStore, selectedZone: NullableZone, geoids: Set<string>) => {
    const shatterMappings = mapStoreRef.shatterMappings
    let mappedGeoids = geoids
    if (Object.keys(shatterMappings)) {
      geoids.forEach(id => {
        if (shatterMappings.hasOwnProperty(id)){
          mappedGeoids.delete(id)
          const children = shatterMappings[id]
          mappedGeoids = new Set([...mappedGeoids, ...children])
        }
    })}
    
    mapStoreRef.setZoneAssignments(selectedZone, mappedGeoids);

    const accumulatedBlockPopulations = mapStoreRef.accumulatedBlockPopulations;

    const population = Array.from(
      Object.values(accumulatedBlockPopulations)
    ).reduce((acc, val) => acc + Number(val), 0);

    selectedZone && mapStoreRef.setZonePopulations(selectedZone, population);
  },
  1 // 1ms debounce
);

const mapShatterableFeatures = (
  features: Array<MapGeoJSONFeature>,
  shatterMappings: MapStore["shatterMappings"],
  child_layer: string
) => {};
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
  mapStoreRef: MapStore
) => {
  if (map) {
    let {
      accumulatedGeoids,
      accumulatedBlockPopulations,
      activeTool,
      shatterMappings,
      mapDocument,
    } = mapStoreRef;
    const selectedZone =
      activeTool === "eraser" ? null : mapStoreRef.selectedZone;
    features?.forEach((feature) => {
      const id = feature?.id ?? undefined;
      const childLayer = mapDocument?.child_layer;

      if (id && shatterMappings.hasOwnProperty(id) && childLayer) {
        const children = shatterMappings[id];

        children.forEach((childId) => {
          map.setFeatureState(
            {
              source: BLOCK_SOURCE_ID,
              id: childId,
              sourceLayer: childLayer,
            },
            { selected: true, zone: selectedZone }
          );
        });
      } else {
        map.setFeatureState(
          {
            source: BLOCK_SOURCE_ID,
            id: feature?.id ?? undefined,
            sourceLayer: feature.sourceLayer,
          },
          { selected: true, zone: selectedZone }
        );
      }
    });

    if (features?.length) {
      features.forEach((feature) => {
        accumulatedGeoids.add(feature.properties?.path);
        accumulatedBlockPopulations.set(
          feature.properties?.path,
          feature.properties?.total_pop
        );
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
  if (accumulatedGeoids?.size) {
    debouncedSetZoneAssignments(
      mapStoreRef,
      mapStoreRef.activeTool === "brush" ? mapStoreRef.selectedZone : null,
      mapStoreRef.accumulatedGeoids
    );
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
  sourceLayer: string
) => {
  if (map && Object.keys(mapStoreRef.zoneAssignments).length) {
    map.removeFeatureState({
      source: BLOCK_SOURCE_ID,
      sourceLayer: sourceLayer,
    });

    mapStoreRef.setAccumulatedGeoids(new Set());
    // reset zoneAssignments
    mapStoreRef.resetZoneAssignments();
    // confirm the map has been reset
    mapStoreRef.setFreshMap(false);
  }
};
