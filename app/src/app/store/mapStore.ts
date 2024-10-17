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
  ShatterResult,
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
import bbox from "@turf/bbox";

const combineSetValues = (
  setRecord: Record<string, Set<unknown>>,
  keys?: string[]
) => {
  const combinedSet = new Set<unknown>(); // Create a new set to hold combined values
  for (const key in setRecord) {
    if (setRecord.hasOwnProperty(key) && (!keys || keys?.includes(key))) {
      setRecord[key].forEach((value) => combinedSet.add(value)); // Add each value to the combined set
    }
  }
  return combinedSet; // Return the combined set
};

const prodWrapper: typeof devtools = (store: any) => store;
const devwrapper =
  process.env.NODE_ENV === "development" ? devtools : prodWrapper;

export interface MapStore {
  // LOAD AND RENDERING STATE TRACKING
  appLoadingState: "loaded" | "initializing" | "loading";
  setAppLoadingState: (state: MapStore["appLoadingState"]) => void;
  mapRenderingState: "loaded" | "initializing" | "loading";
  setMapRenderingState: (state: MapStore["mapRenderingState"]) => void;
  // MAP CANVAS REF AND CONTROLS
  getMapRef: () => maplibregl.Map | null;
  setMapRef: (map: MutableRefObject<maplibregl.Map | null>) => void;
  mapLock: boolean;
  setMapLock: (lock: boolean) => void;
  // MAP DOCUMENT
  mapDocument: DocumentObject | null;
  setMapDocument: (mapDocument: DocumentObject) => void;
  // SHATTERING
  captiveIds: Set<string>;
  mapBbox: [number, number, number, number] | null;
  shatterIds: {
    parents: Set<string>;
    children: Set<string>;
  };
  shatterMappings: Record<string, Set<string>>;
  resetShatterView: () => void;
  setShatterIds: (
    existingParents: Set<string>,
    existingChildren: Set<string>,
    newParent: string[],
    newChildren: Set<string>[],
    multipleShattered: boolean
  ) => void;
  handleShatter: (
    document_id: string,
    feautres: Array<MapGeoJSONFeature>
  ) => void;  
  removeShatter: (parentId: string) => void;
  // HOVERING
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
  zoneAssignments: Map<string, NullableZone>; // geoid -> zone
  setZoneAssignments: (zone: NullableZone, gdbPaths: Set<GDBPath>) => void;
  loadZoneAssignments: (assigments: Assignment[]) => void;
  resetZoneAssignments: () => void;
  zonePopulations: Map<Zone, number>;
  setZonePopulations: (zone: Zone, population: number) => void;
  accumulatedGeoids: Set<string>;
  setAccumulatedGeoids: (geoids: MapStore["accumulatedGeoids"]) => void;
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

const initialLoadingState =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("document_id")
    ? "loading"
    : "initializing";

export const useMapStore = create(
  devtools(
    subscribeWithSelector<MapStore>((set, get) => ({
      appLoadingState: initialLoadingState,
      setAppLoadingState: (appLoadingState) => set({ appLoadingState }),
      mapRenderingState: "initializing",
      setMapRenderingState: (mapRenderingState) => set({ mapRenderingState }),
      getMapRef: () => null,
      setMapRef: (mapRef) => {
        set({
          getMapRef: () => mapRef.current,
          appLoadingState:
            initialLoadingState === "initializing"
              ? "loaded"
              : get().appLoadingState,
        });
      },
      mapLock: false,
      setMapLock: (mapLock) => set({ mapLock }),
      mapDocument: null,
      setMapDocument: (mapDocument) => {
        const currentMapDocument = get().mapDocument;
        if (currentMapDocument?.document_id === mapDocument.document_id) {
          return;
        }
        get().setFreshMap(true);
        get().resetZoneAssignments();

        set({
          mapDocument: mapDocument,
          shatterIds: { parents: new Set(), children: new Set() },
        });
      },
      shatterIds: {
        parents: new Set(),
        children: new Set(),
      },
      captiveIds: new Set<string>(),
      resetShatterView: () => {
        set({
          captiveIds: new Set<string>(),
          mapBbox: null,
        });
      },
      mapBbox: null,
      handleShatter: async (document_id, features) => {
        set({ mapLock: true });
        const geoids = features
          .map((f) => f.id?.toString())
          .filter(Boolean) as string[];

        const shatterMappings = get().shatterMappings;
        const isAlreadyShattered = geoids.some((id) =>
          shatterMappings.hasOwnProperty(id)
        );
        console.log('!!!ALREADY', isAlreadyShattered)

        const shatterResult: ShatterResult = isAlreadyShattered
          ? ({
              parents: { geoids },
              children: Array.from(
                combineSetValues(shatterMappings, geoids)
              ).map((id) => ({
                geo_id: id,
                document_id,
                parent_path: "",
              })),
            } as ShatterResult)
          : await patchShatter.mutate({
              document_id,
              geoids,
            });

        console.log("!!!SHATTER RESULT", shatterResult)
        // TODO Need to return child edges even if the parent is already shattered
        // currently returns nothing
        const shatterIds = get().shatterIds;

        let existingParents = new Set(shatterIds.parents);
        let existingChildren = new Set(shatterIds.children);
        const newParent = shatterResult.parents.geoids;
        const newChildren = new Set(
          shatterResult.children.map((child) => child.geo_id)
        );

        const zoneAssignments = new Map(get().zoneAssignments);
        const multipleShattered = shatterResult.parents.geoids.length > 1;
        const featureBbox = bbox(features[0].geometry);
        const mapBbox =
          featureBbox?.length >= 4
            ? (featureBbox.slice(0, 4) as MapStore["mapBbox"])
            : undefined;

        newParent.forEach((parent) => existingParents.add(parent));
        existingChildren = new Set([...existingChildren, ...newChildren])

        if (!isAlreadyShattered && !multipleShattered) {
          setZones(zoneAssignments, newParent[0], newChildren);
          shatterMappings[newParent[0]] = newChildren;
        } else if (multipleShattered) {
          // todo handle multiple shattered case
        } else if (isAlreadyShattered) {
          set({
            captiveIds: newChildren,
            mapBbox,
            mapLock: false,
          });
          return;
        }

        set({
          shatterIds: {
            parents: existingParents,
            children: existingChildren,
          },
          mapLock: false,
          captiveIds: newChildren,
          mapBbox,
          zoneAssignments,
        });
      },
      removeShatter: (parentId) => {
        const { shatterIds, shatterMappings, zoneAssignments } = get();

        const children = shatterMappings[parentId];
        // Remove the parent from shatterMappings
        delete shatterMappings[parentId];

        // Remove the parent from shatterIds
        shatterIds.parents.delete(parentId);

        // Remove the children from shatterIds and zoneAssignments
        children.forEach((child) => {
          shatterIds.children.delete(child);
          zoneAssignments.delete(child); // Remove child from zoneAssignments
        });

        set({
          shatterIds: {
            parents: new Set(shatterIds.parents),
            children: new Set(shatterIds.children),
          },
          shatterMappings, // Update shatterMappings
          zoneAssignments, // Update zoneAssignments
        });
      },
      shatterMappings: {},
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
          (children) =>
            (existingChildren = new Set([...existingChildren, ...children]))
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
      setAccumulatedGeoids: (accumulatedGeoids) => set({ accumulatedGeoids }),
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
        const shatterMappings: Record<string, Set<string>> = {};
        assignments.forEach((assignment) => {
          zoneAssignments.set(assignment.geo_id, assignment.zone);
          if (assignment.parent_path) {
            shatterIds.parents.add(assignment.parent_path);
            shatterIds.children.add(assignment.geo_id);
            shatterMappings[assignment.parent_path] =
              shatterMappings[assignment.parent_path] || new Set();
            shatterMappings[assignment.parent_path].add(assignment.geo_id);
          }
        });
        set({
          shatterMappings,
          zoneAssignments,
          shatterIds,
          appLoadingState: "loaded",
        });
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
  )
);

// these need to initialize after the map store
getRenderSubscriptions(useMapStore);
getMapMetricsSubs(useMapStore);
getMapEditSubs(useMapStore);
getSearchParamsObersver();