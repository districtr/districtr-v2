import type { MapOptions } from "maplibre-gl";
import { create } from "zustand";
import type { ActiveTool, SpatialUnit } from "../constants/types";
export interface MapStore {
  mapOptions: MapOptions;
  setMapOptions: (options: MapOptions) => void;
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  spatialUnit: SpatialUnit;
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
  spatialUnit: "county",
}));
