import type { MapOptions } from "maplibre-gl";
import { create } from "zustand";
import type { ActiveTool, SpatialUnit } from "../constants/types";
import { Zone, GDBPath, GEOID } from "../constants/types";
import { gerryDBView } from "../api/apiHandlers";
import { addBlockLayers, removeBlockLayers } from "../constants/layers";
import maplibregl from "maplibre-gl";
import type { MutableRefObject } from "react";

export interface MapStore {
  mapRef: MutableRefObject<maplibregl.Map | null> | null;
  setMapRef: (map: MutableRefObject<maplibregl.Map | null>) => void;
  documentId: string | null;
  setDocumentId: (documentId: string) => void;
  selectedLayer: gerryDBView | null;
  setSelectedLayer: (layer: gerryDBView) => void;
  mapOptions: MapOptions;
  setMapOptions: (options: MapOptions) => void;
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  spatialUnit: SpatialUnit;
  setSpatialUnit: (unit: SpatialUnit) => void;
  selectedZone: Zone;
  setSelectedZone: (zone: Zone) => void;
  zoneAssignments: Map<string, number>; // geoid -> zone
  setZoneAssignments: (zone: Zone, gdbPaths: Set<GDBPath>) => void;
  resetZoneAssignments: () => void;
  accumulatedGeoids: Set<string>;
  brushSize: number;
  setBrushSize: (size: number) => void;
  isPainting: boolean;
  setIsPainting: (isPainting: boolean) => void;
  clearMapEdits: () => void;
  freshMap: boolean;
  setFreshMap: (resetMap: boolean) => void;
  router: any;
  setRouter: (router: any) => void;
  pathname: string;
  setPathname: (pathname: string) => void;
  urlParams: URLSearchParams;
  setUrlParams: (params: URLSearchParams) => void;
}

export const useMapStore = create<MapStore>((set) => ({
  mapRef: null,
  setMapRef: (mapRef) => set({ mapRef }),
  documentId: null,
  setDocumentId: (documentId) => set({ documentId }),
  selectedLayer: null,
  setSelectedLayer: (layer) =>
    set((state) => {
      if (state.mapRef) {
        removeBlockLayers(state.mapRef);
        addBlockLayers(state.mapRef, layer);
      }
      return { selectedLayer: layer };
    }),
  mapOptions: {
    center: [-98.5795, 39.8283],
    zoom: 3,
    pitch: 0,
    bearing: 0,
    container: "",
  },
  setMapOptions: (options) => set({ mapOptions: options }),
  activeTool: "pan",
  setActiveTool: (tool) => set({ activeTool: tool }),
  spatialUnit: "tract",
  setSpatialUnit: (unit) => set({ spatialUnit: unit }),
  selectedZone: 1,
  setSelectedZone: (zone) => set({ selectedZone: zone }),
  zoneAssignments: new Map(),
  accumulatedGeoids: new Set<string>(),
  setZoneAssignments: (zone, geoids) =>
    set((state) => {
      const newZoneAssignments = new Map(state.zoneAssignments);
      geoids.forEach((geoid) => {
        newZoneAssignments.set(geoid, zone);
      });
      return {
        zoneAssignments: newZoneAssignments,
        accumulatedGeoids: new Set<string>(),
      };
    }),
  resetZoneAssignments: () => set({ zoneAssignments: new Map() }),
  brushSize: 50,
  setBrushSize: (size) => set({ brushSize: size }),
  isPainting: false,
  setIsPainting: (isPainting) => set({ isPainting }),
  clearMapEdits: () =>
    set({
      zoneAssignments: new Map(),
      accumulatedGeoids: new Set<string>(),
      selectedZone: 1,
    }),
  freshMap: false,
  setFreshMap: (resetMap) => set({ freshMap: resetMap }),
  router: null,
  setRouter: (router) => set({ router }),
  pathname: "",
  setPathname: (pathname) => set({ pathname }),
  urlParams: new URLSearchParams(),
  setUrlParams: (params) => set({ urlParams: params }),
}));
