import type { MapGeoJSONFeature, MapOptions } from "maplibre-gl";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  ActiveTool,
  MapFeatureInfo,
  SpatialUnit,
} from "../constants/types";
import { Zone, GDBPath } from "../constants/types";
import {
  Assignment,
  DocumentObject,
  ZonePopulation,
} from "../utils/api/apiHandlers";
import maplibregl from "maplibre-gl";
import type { MutableRefObject } from "react";
import { UseQueryResult } from "@tanstack/react-query";
import {
  ContextMenuState,
  LayerVisibility,
  PaintEventHandler,
  getFeaturesInBbox,
  setZones,
} from "../utils/helpers";
import { getRenderSubscriptions } from "./mapRenderSubs";
import { patchShatter } from "../utils/api/mutations";
import { getSearchParamsObersver } from "../utils/api/queryParamsListener";
import { getMapMetricsSubs } from "./metricsSubs";
import { getMapEditSubs } from "./mapEditSubs";

export interface MapStore {
  appLoadingState: "loaded" | "initializing" | "loading";
  setAppLoadingState: (state: MapStore["appLoadingState"]) => void;
  mapRenderingState: "loaded" | "initializing" | "loading";
  setMapRenderingState: (state: MapStore["mapRenderingState"]) => void;
  mapRef: MutableRefObject<maplibregl.Map | null> | null;
  setMapRef: (map: MutableRefObject<maplibregl.Map | null>) => void;
  mapLock: boolean;
  setMapLock: (lock: boolean) => void;
  mapDocument: DocumentObject | null;
  setMapDocument: (mapDocument: DocumentObject) => void;
  shatterIds: {
    parents: Set<string>;
    children: Set<string>;
  };
  setShatterIds: (
    existingParents: Set<string>,
    existingChildren: Set<string>,
    newParent: string[],
    newChildren: Set<string>[],
    multipleShattered: boolean
  ) => void;
  handleShatter: (document_id: string, geoids: string[]) => void;
  hoverFeatures: Array<MapFeatureInfo>;
  setHoverFeatures: (features?: Array<MapGeoJSONFeature>) => void;
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
  loadZoneAssignments: (assigments: Assignment[]) => void;
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
    metrics: UseQueryResult<ZonePopulation[], Error> | null
  ) => void;
  visibleLayerIds: string[];
  setVisibleLayerIds: (layerIds: string[]) => void;
  addVisibleLayerIds: (layerIds: string[]) => void;
  updateVisibleLayerIds: (layerIds: LayerVisibility[]) => void;
  contextMenu: ContextMenuState | null;
  setContextMenu: (menu: ContextMenuState | null) => void;
}

const initialLoadingState = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has(
  "document_id"
)
  ? "loading"
  : "initializing";

export const useMapStore = create(
  subscribeWithSelector<MapStore>((set, get) => ({
    appLoadingState: initialLoadingState,
    setAppLoadingState: (appLoadingState) => set({ appLoadingState }),
    mapRenderingState: "initializing",
    setMapRenderingState: (mapRenderingState) => set({ mapRenderingState }),
    mapRef: null,
    setMapRef: (mapRef) =>
      set({
        mapRef,
        appLoadingState:
          initialLoadingState === "initializing"
            ? "loaded"
            : get().appLoadingState,
      }),
    mapLock: false,
    setMapLock: (mapLock) => set({ mapLock }),
    mapDocument: null,
    setMapDocument: (mapDocument) =>
      set((state) => {
        state.setFreshMap(true);
        state.resetZoneAssignments();
        return {
          mapDocument: mapDocument,
          shatterIds: { parents: new Set(), children: new Set() },
        };
      }),
    shatterIds: {
      parents: new Set(),
      children: new Set(),
    },
    handleShatter: async (document_id, geoids) => {
      set({ mapLock: true });
      const shatterResult = await patchShatter.mutate({
        document_id,
        geoids,
      });

      const zoneAssignments = new Map(get().zoneAssignments);
      const shatterIds = get().shatterIds;

      let existingParents = new Set(shatterIds.parents);
      let existingChildren = new Set(shatterIds.children);

      const newParent = shatterResult.parents.geoids;
      const newChildren = new Set(
        shatterResult.children.map((child) => child.geo_id)
      );

      const multipleShattered = shatterResult.parents.geoids.length > 1;
      if (!multipleShattered) {
        setZones(zoneAssignments, newParent[0], newChildren);
      } else {
        // todo handle multiple shattered case
      }
      newParent.forEach((parent) => existingParents.add(parent));
      // there may be a faster way to do this
      [newChildren].forEach(
        (children) => existingChildren = new Set(...existingChildren, ...children)
      )

      set({
        shatterIds: {
          parents: existingParents,
          children: existingChildren,
        },
        zoneAssignments,
      });
    },
    setShatterIds: (
      existingParents,
      existingChildren,
      newParent,
      newChildren,
      multipleShattered
    ) => {
      const zoneAssignments = new Map(get().zoneAssignments);

      if (!multipleShattered) {
        setZones(zoneAssignments, newParent[0], newChildren[0]);
      } else {
        // todo handle multiple shattered case
      }
      newParent.forEach((parent) => existingParents.add(parent));
      // there may be a faster way to do this
      newChildren.forEach(
        (children) => existingChildren = new Set(...existingChildren, ...children)
      );

      set({
        shatterIds: {
          parents: existingParents,
          children: existingChildren,
        },
        zoneAssignments,
      });
    },
    hoverFeatures: [],
    setHoverFeatures: (_features) => {
      const hoverFeatures = _features
        ? _features.map((f) => ({
            source: f.source,
            sourceLayer: f.sourceLayer,
            id: f.id,
          }))
        : [];

      set({ hoverFeatures });
    },
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
    setZoneAssignments: (zone, geoids) => {
      const zoneAssignments = get().zoneAssignments;
      const newZoneAssignments = new Map(zoneAssignments);
      geoids.forEach((geoid) => {
        newZoneAssignments.set(geoid, zone);
      });
      set({
        zoneAssignments: newZoneAssignments,
        accumulatedGeoids: new Set<string>(),
      });
    },
    loadZoneAssignments: (assignments) => {
      const zoneAssignments = new Map<string, number>();
      const shatterIds = {
        parents: new Set<string>(),
        children: new Set<string>(),
      };
      assignments.forEach((assignment) => {
        zoneAssignments.set(assignment.geo_id, assignment.zone);
        if (assignment.parent_path) {
          shatterIds.parents.add(assignment.parent_path);
          shatterIds.children.add(assignment.geo_id);
        }
      });
      set({ zoneAssignments, shatterIds, appLoadingState: "loaded" });
    },
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
    contextMenu: null,
    setContextMenu: (contextMenu) => set({ contextMenu }),
  }))
);

// these need to initialize after the map store
getRenderSubscriptions(useMapStore);
getMapMetricsSubs(useMapStore);
getMapEditSubs(useMapStore);
getSearchParamsObersver();