"use client"
import type { MapGeoJSONFeature, MapOptions } from "maplibre-gl";
import { create } from "zustand";
import { devtools, subscribeWithSelector, persist } from "zustand/middleware";
import type {
  ActiveTool,
  MapFeatureInfo,
  NullableZone,
  SpatialUnit,
} from "../constants/types";
import { Zone, GDBPath } from "../constants/types";
import {
  Assignment,
  DistrictrMap,
  DocumentObject,
  P1TotPopSummaryStats,
  ZonePopulation,
} from "../utils/api/apiHandlers";
import maplibregl from "maplibre-gl";
import type { MutableRefObject } from "react";
import { QueryObserverResult, UseQueryResult } from "@tanstack/react-query";
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
import { getQueriesResultsSubs } from "../utils/api/queries";
import { persistOptions } from "./persistConfig";


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
  mapViews: Partial<QueryObserverResult<DistrictrMap[], Error>>;
  setMapViews: (maps: MapStore["mapViews"]) => void;
  mapDocument: DocumentObject | null;
  setMapDocument: (mapDocument: DocumentObject) => void;
  summaryStats: {
    totpop?: {
      data: P1TotPopSummaryStats
    } 
  },
  setSummaryStat: <T extends keyof MapStore['summaryStats']>(
    stat: T,
    value: MapStore['summaryStats'][T]
  ) => void,
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
  zoneAssignments: Map<string, NullableZone>; // geoid -> zone
  setZoneAssignments: (zone: NullableZone, gdbPaths: Set<GDBPath>) => void;
  assignmentsHash: string;
  setAssignmentsHash: (hash: string) => void;
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
  userMaps: Array<DocumentObject & { name?: string }>;
  setUserMaps: (userMaps: MapStore["userMaps"]) => void;
  upcertUserMap: (props: {
    documentId?: string;
    mapDocument?: MapStore["mapDocument"];
    userMapDocumentId?: string;
    userMapData?: MapStore["userMaps"][number];
  }) => void;
}

const initialLoadingState =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("document_id")
    ? "loading"
    : "initializing";

export const useMapStore = create(
  persist(
    devwrapper(
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
        mapViews: { isPending: true },
        setMapViews: (mapViews) => set({ mapViews }),
        mapDocument: null,
        setMapDocument: (mapDocument) => {
          const currentMapDocument = get().mapDocument;
          if (currentMapDocument?.document_id === mapDocument.document_id) {
            return;
          }
          get().setFreshMap(true);
          get().resetZoneAssignments();
          get().upcertUserMap({
            mapDocument,
          })
          set({
            mapDocument: mapDocument,
            shatterIds: { parents: new Set(), children: new Set() },
          });
        },
        summaryStats: {},
        setSummaryStat: (stat, value) => {
          set({
            summaryStats: {
              ...get().summaryStats,
              [stat]: value
            }
          })
        },
        upcertUserMap: ({ mapDocument, userMapData, userMapDocumentId }) => {
          let userMaps = [ ...get().userMaps ];
          const mapViews = get().mapViews.data
          if (mapDocument?.document_id && mapViews) {
            const documentIndex = userMaps.findIndex(
              (f) => f.document_id === mapDocument?.document_id
            );
            const documentInfo = mapViews.find(
              (view) => view.gerrydb_table_name === mapDocument.gerrydb_table
            );
            if (documentIndex !== -1) {
              userMaps[documentIndex] = {
                ...documentInfo,
                ...userMaps[documentIndex],
                ...mapDocument,
              };
            } else {
              userMaps = [{ ...mapDocument, ...documentInfo }, ...userMaps];
            }
          } else if (userMapDocumentId) {
            const i = userMaps.findIndex(map => map.document_id === userMapDocumentId)
            if (userMapData) {
              userMaps.splice(i, 1, userMapData); // Replace the map at index i with the new data
            } else {
              const urlParams = new URL(window.location.href).searchParams;
              urlParams.delete("document_id"); // Remove the document_id parameter
              window.history.pushState({}, '', window.location.pathname + '?' + urlParams.toString()); // Update the URL without document_id
              userMaps.splice(i, 1);
            }
          }
          set({
            userMaps,
          });
        },
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
        assignmentsHash: "",
        setAssignmentsHash: (hash) => set({ assignmentsHash: hash }),
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
        userMaps: [],
        setUserMaps: (userMaps) => set({ userMaps }),
      }))
    ),
    persistOptions
  )
);

// these need to initialize after the map store
getRenderSubscriptions(useMapStore);
getMapMetricsSubs(useMapStore);
getQueriesResultsSubs(useMapStore);
getMapEditSubs(useMapStore);
getSearchParamsObersver();
