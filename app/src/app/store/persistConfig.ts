import { PersistOptions } from "zustand/middleware"
import { MapStore } from "./mapStore"


export const persistOptions: PersistOptions<MapStore, Partial<MapStore>> = {
  name: 'districtr-persistrictr', 
  version: 0,
  partialize: (state) => ({ 
    userMaps: state.userMaps 
  }),

}
