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
