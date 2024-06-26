import { create } from "zustand";
import { Zone, GEOID, ZoneDict } from "../constants/types";

export interface ZoneStore {
  selectedZone: Zone;
  setSelectedZone: (zone: Zone) => void;
  zoneAssignments: Map<string, number>; // geoid -> zone
  setZoneAssignments: (zone: Zone, geoids: Set<GEOID>) => void;
}

export const useZoneStore = create<ZoneStore>((set) => ({
  selectedZone: 1,
  setSelectedZone: (zone: Zone) => set({ selectedZone: zone }),
  zoneAssignments: new Map(),
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
      return { zoneAssignments: newZoneAssignments };
    }),
}));
