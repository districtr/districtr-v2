import { create } from "zustand";
import { Zone, GEOID, ZoneDict } from "../constants/types";

export interface ZoneStore {
  selectedZone: Zone;
  setSelectedZone: (zone: Zone) => void;
  zoneAssignments: Map<string, number>; // Specify the type of zoneAssignments as Map<string, number>
  setZoneAssignments: (zone: Zone, geoids: Set<GEOID>) => void;
}

export const useZoneStore = create<ZoneStore>((set) => ({
  selectedZone: 1,
  setSelectedZone: (zone: Zone) => set({ selectedZone: zone }),
  zoneAssignments: new Map(),
  // setZoneAssignments should reference existing dict,
  // and accept a zone id and a list of geoids to add to the list.
  // if the geoids exist in other key lists, they must be removed from those lists.
  setZoneAssignments: (zone: Zone, geoids: Set<GEOID>) =>
    set((state) => {
      const newZoneAssignments = new Map([...state.zoneAssignments]);
      geoids.forEach((geoid) => {
        newZoneAssignments.set(geoid, zone);
      });
      return { zoneAssignments: newZoneAssignments };
    }),
}));
