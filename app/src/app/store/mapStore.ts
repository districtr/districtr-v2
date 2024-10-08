import type { MapOptions } from "maplibre-gl";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { ActiveTool, SpatialUnit } from "../constants/types";
import { Zone, GDBPath } from "../constants/types";
import {
  gerryDBView,
  DocumentObject,
  ZonePopulation,
} from "../api/apiHandlers";
import maplibregl from "maplibre-gl";
import type { MutableRefObject } from "react";
import {
  addBlockLayers,
  BLOCK_LAYER_ID,
  BLOCK_HOVER_LAYER_ID,
} from "../constants/layers";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  LayerVisibility,
  PaintEventHandler,
  getFeaturesInBbox,
} from "../utils/helpers";

export interface MapStore {
  mapRef: MutableRefObject<maplibregl.Map | null> | null;
  setMapRef: (map: MutableRefObject<maplibregl.Map | null>) => void;
  mapDocument: DocumentObject | null;
  setMapDocument: (mapDocument: DocumentObject) => void;
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
  accumulatedBlockPopulations: Map<string, number>;
  resetAccumulatedBlockPopulations: () => void;
  zoneAssignments: Map<string, Zone>; // geoid -> zone
  setZoneAssignments: (zone: Zone, gdbPaths: Set<GDBPath>) => void;
  resetZoneAssignments: () => void;
  zonePopulations: Map<Zone, number>;
  setZonePopulations: (zone: Zone, population: number) => void;
  accumulatedGeoids: Set<string>;
  brushSize: number;
  setBrushSize: (size: number) => void;
  isPainting: boolean;
  setIsPainting: (isPainting: boolean) => void;
  paintFunction: PaintEventHandler;
  setPaintFunction: (paintFunction: PaintEventHandler) => void;
  clearMapEdits: () => void;
  freshMap: boolean;
  setFreshMap: (resetMap: boolean) => void;
  mapMetrics: UseQueryResult<ZonePopulation[], Error> | null;
  setMapMetrics: (
    metrics: UseQueryResult<ZonePopulation[], Error> | null,
  ) => void;
  visibleLayerIds: string[];
  setVisibleLayerIds: (layerIds: string[]) => void;
  addVisibleLayerIds: (layerIds: string[]) => void;
  updateVisibleLayerIds: (layerIds: LayerVisibility[]) => void;
}

export const useMapStore = create(
  subscribeWithSelector<MapStore>((set) => ({
    mapRef: null,
    setMapRef: (mapRef) => set({ mapRef }),
    mapDocument: null,
    setMapDocument: (mapDocument) =>
      set((state) => {
        if (mapDocument.tiles_s3_path) {
          state.setSelectedLayer({
            name: mapDocument.gerrydb_table,
            tiles_s3_path: mapDocument.tiles_s3_path,
          });
        }
        state.setFreshMap(true);
        state.resetZoneAssignments();
        return { mapDocument: mapDocument };
      }),
    selectedLayer: null,
    setSelectedLayer: (layer) => set({ selectedLayer: layer }),
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
    accumulatedBlockPopulations: new Map<string, number>(),
    resetAccumulatedBlockPopulations: () =>
      set({ accumulatedBlockPopulations: new Map<string, number>() }),
    zonePopulations: new Map(),
    setZonePopulations: (zone, population) =>
      set((state) => {
        const newZonePopulations = new Map(state.zonePopulations);
        newZonePopulations.set(zone, population);
        return {
          zonePopulations: newZonePopulations,
        };
      }),
    resetZoneAssignments: () => set({ zoneAssignments: new Map() }),
    brushSize: 50,
    setBrushSize: (size) => set({ brushSize: size }),
    isPainting: false,
    setIsPainting: (isPainting) => set({ isPainting }),
    paintFunction: getFeaturesInBbox,
    setPaintFunction: (paintFunction) => set({ paintFunction }),
    clearMapEdits: () =>
      set({
        zoneAssignments: new Map(),
        accumulatedGeoids: new Set<string>(),
        selectedZone: 1,
      }),
    freshMap: false,
    setFreshMap: (resetMap) => set({ freshMap: resetMap }),
    mapMetrics: null,
    setMapMetrics: (metrics) => set({ mapMetrics: metrics }),
    visibleLayerIds: ["counties_boundary", "counties_labels"],
    setVisibleLayerIds: (layerIds) => set({ visibleLayerIds: layerIds }),
    addVisibleLayerIds: (layerIds: string[]) => {
      set((state) => {
        const newVisibleLayerIds = new Set(state.visibleLayerIds);
        layerIds.forEach((layerId) => {
          newVisibleLayerIds.add(layerId);
        });
        return { visibleLayerIds: Array.from(newVisibleLayerIds) };
      });
    },
    updateVisibleLayerIds: (layerVisibilities: LayerVisibility[]) => {
      set((state) => {
        const newVisibleLayerIds = new Set(state.visibleLayerIds);
        layerVisibilities.forEach((layerVisibility) => {
          if (layerVisibility.visibility === "visible") {
            newVisibleLayerIds.add(layerVisibility.layerId);
          } else {
            newVisibleLayerIds.delete(layerVisibility.layerId);
          }
        });
        return { visibleLayerIds: Array.from(newVisibleLayerIds) };
      });
    },
  })),
);

useMapStore.subscribe(
  (state) => state.selectedLayer,
  (selectedLayer) => {
    const mapStore = useMapStore.getState();
    if (mapStore.mapRef && selectedLayer) {
      addBlockLayers(mapStore.mapRef, selectedLayer);
      mapStore.addVisibleLayerIds([BLOCK_LAYER_ID, BLOCK_HOVER_LAYER_ID]);
    }
  },
);
