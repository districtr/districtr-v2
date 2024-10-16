import type { MapGeoJSONFeature, MapOptions } from "maplibre-gl";
import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import type {
  ActiveTool,
  MapFeatureInfo,
  NullableZone,
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
import { onlyUnique } from "../utils/arrays";

const prodWrapper: typeof devtools = (store: any) => store
const devwrapper = process.env.NODE_ENV === 'development' ? devtools : prodWrapper

export interface MapStore {
  appLoadingState: "loaded" | "initializing" | "loading";
  setAppLoadingState: (state: MapStore["appLoadingState"]) => void;
  mapRenderingState: "loaded" | "initializing" | "loading";
  setMapRenderingState: (state: MapStore["mapRenderingState"]) => void;
  getMapRef: () => maplibregl.Map | null;
  setMapRef: (map: MutableRefObject<maplibregl.Map | null>) => void;
  mapLock: boolean;
  setMapLock: (lock: boolean) => void;
  mapDocument: DocumentObject | null;
  setMapDocument: (mapDocument: DocumentObject) => void;
  shatterIds: {
    parents: Array<string>;
    children: Array<string>;
  };
  // setShatterIds: (
  //   existingParents: Set<string>,
  //   existingChildren: Set<string>,
  //   newParent: string[],
  //   newChildren: Set<string>[],
  //   multipleShattered: boolean
  // ) => void;
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
  accumulatedBlockPopulations: Record<string, number>;
  resetAccumulatedBlockPopulations: () => void;
  zoneAssignments: Record<string, NullableZone>; // geoid -> zone
  setZoneAssignments: (zone: NullableZone, gdbPaths: Array<GDBPath>) => void;
  loadZoneAssignments: (assigments: Assignment[]) => void;
  resetZoneAssignments: () => void;
  zonePopulations: Record<Zone, number>;
  setZonePopulations: (zone: Zone, population: number) => void;
  accumulatedGeoids: Array<string>;
  setAccumulatedGeoids: (geoids: MapStore['accumulatedGeoids']) => void;
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

export const useMapStore = create(devwrapper(
  subscribeWithSelector<MapStore>((set, get) => ({
    appLoadingState: initialLoadingState,
    setAppLoadingState: (appLoadingState) => set({ appLoadingState }),
    mapRenderingState: "initializing",
    setMapRenderingState: (mapRenderingState) => set({ mapRenderingState }),
    getMapRef: () => null,
    setMapRef: (mapRef) =>
      set({
        getMapRef: () => mapRef.current,
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
          shatterIds: { parents: [], children: [] },
        };
      }),
    shatterIds: {
      parents: [],
      children: []
    },
    handleShatter: async (document_id, geoids) => {
      set({ mapLock: true });
      const shatterResult = await patchShatter.mutate({
        document_id,
        geoids,
      });
      const { zoneAssignments: _zoneAssignments, shatterIds} = get()
      const zoneAssignments = {..._zoneAssignments};

      let existingParents = [...shatterIds.parents]
      let existingChildren = [...shatterIds.children]

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
      newParent.forEach((parent) => existingParents.push(parent));
      // there may be a faster way to do this
      [newChildren].forEach(
        (children) => existingChildren = [...existingChildren, ...children]
      )

      set({
        shatterIds: {
          parents: existingParents,
          children: existingChildren,
        },
        zoneAssignments,
      });
    },
    // setShatterIds: (
    //   existingParents,
    //   existingChildren,
    //   newParent,
    //   newChildren,
    //   multipleShattered
    // ) => {
    //   const zoneAssignments = {...get().zoneAssignments}

    //   if (!multipleShattered) {
    //     setZones(zoneAssignments, newParent[0], newChildren[0]);
    //   } else {
    //     // todo handle multiple shattered case
    //   }
    //   newParent.forEach((parent) => existingParents.add(parent));
    //   // there may be a faster way to do this
    //   newChildren.forEach(
    //     (children) => existingChildren = new Set([...existingChildren, ...children])
    //   );

    //   set({
    //     shatterIds: {
    //       parents: existingParents,
    //       children: existingChildren,
    //     },
    //     zoneAssignments,
    //   });
    // },
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
    zoneAssignments: {},
    accumulatedGeoids: [],
    setAccumulatedGeoids: (geoids: MapStore['accumulatedGeoids']) => set({accumulatedGeoids: geoids}),
    setZoneAssignments: (zone, geoids) => {
      const zoneAssignments = get().zoneAssignments;
      const newZoneAssignments = {...zoneAssignments}
      geoids.forEach((geoid) => {
        newZoneAssignments[geoid] = zone
      });
      set({
        zoneAssignments: newZoneAssignments,
        accumulatedGeoids: [],
      });
    },
    loadZoneAssignments: (assignments) => {
      const zoneAssignments: MapStore['zoneAssignments'] = {}
      const shatterIds: MapStore['shatterIds'] = {
        parents: [],
        children: []
      };
      assignments.forEach((assignment) => {
        zoneAssignments[assignment.geo_id] = assignment.zone
        if (assignment.parent_path) {
          shatterIds.parents.push(assignment.parent_path);
          shatterIds.children.push(assignment.geo_id);
        }
      });
      shatterIds.parents = shatterIds.parents.filter(onlyUnique)
      shatterIds.children = shatterIds.children.filter(onlyUnique)

      set({ zoneAssignments, shatterIds, appLoadingState: "loaded" });
    },
    accumulatedBlockPopulations: {},
    resetAccumulatedBlockPopulations: () =>
      set({ accumulatedBlockPopulations: {} }),
    zonePopulations: {},
    setZonePopulations: (zone, population) =>
      set((state) => {
        const newZonePopulations = {...state.zonePopulations}
        zone && (newZonePopulations[zone] = population)
        return {
          zonePopulations: newZonePopulations,
        };
      }),
    resetZoneAssignments: () => set({ zoneAssignments: {} }),
    brushSize: 50,
    setBrushSize: (size) => set({ brushSize: size }),
    isPainting: false,
    setIsPainting: (isPainting) => set({ isPainting }),
    paintFunction: getFeaturesInBbox,
    setPaintFunction: (paintFunction) => set({ paintFunction }),
    clearMapEdits: () =>
      set({
        zoneAssignments: {},
        accumulatedGeoids: [],
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
));

// these need to initialize after the map store
getRenderSubscriptions(useMapStore);
getMapMetricsSubs(useMapStore);
getMapEditSubs(useMapStore);
getSearchParamsObersver();
