import type { MapOptions } from "maplibre-gl";
import { create } from "zustand";
import type { ActiveTool, SpatialUnit } from "../constants/types";
import { Zone, GEOID } from "../constants/types";
export interface MapStore {
  mapOptions: MapOptions;
  setMapOptions: (options: MapOptions) => void;
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  spatialUnit: SpatialUnit;
  selectedZone: Zone;
  setSelectedZone: (zone: Zone) => void;
  zoneAssignments: Map<string, number>; // geoid -> zone
  setZoneAssignments: (zone: Zone, geoids: Set<GEOID>) => void;
  accumulatedGeoids: Set<string>;
}

export const useMapStore = create<MapStore>((set) => ({
  mapOptions: {
    center: [-98.5795, 39.8283],
    zoom: 3,
    pitch: 0,
    bearing: 0,
    container: "",
  },
  setMapOptions: (options: MapOptions) => set({ mapOptions: options }),
  activeTool: "pan",
  setActiveTool: (tool: ActiveTool) => set({ activeTool: tool }),
  spatialUnit: "tract",
  selectedZone: 1, // id of the zone being painted
  setSelectedZone: (zone: Zone) => set({ selectedZone: zone }),
  zoneAssignments: new Map(),
  accumulatedGeoids: new Set<string>(),
  /**
   *
   * @param zone - identifier for the zone assignment
   * @param geoids - Set of geoids to assign to the zone; members of the set will be assigned to the zone
   * @returns updated dict of geoid: zone assignments
   */
  setZoneAssignments: (zone: Zone, geoids: Set<GEOID>) =>
    set((state) => {
      const newZoneAssignments = new Map([...state.zoneAssignments]);
      geoids.forEach((geoid) => {
        newZoneAssignments.set(geoid, zone);
      });
      return {
        zoneAssignments: newZoneAssignments,
        accumulatedGeoids: new Set<string>(),
      };
    }),
}));
