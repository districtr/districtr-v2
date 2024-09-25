import type { MapGeoJSONFeature, MapOptions } from "maplibre-gl";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  ActiveTool,
  MapFeatureInfo,
  SpatialUnit,
} from "../constants/types";
import { Zone, GDBPath } from "../constants/types";
import { Assignment, DocumentObject, ZonePopulation } from "../api/apiHandlers";
import maplibregl from "maplibre-gl";
import type { MutableRefObject } from "react";
import {
  addBlockLayers,
  BLOCK_LAYER_ID,
  BLOCK_HOVER_LAYER_ID,
  BLOCK_SOURCE_ID,
  PARENT_LAYERS,
  CHILD_LAYERS,
} from "../constants/layers";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  ContextMenuState,
  LayerVisibility,
  PaintEventHandler,
  getFeaturesInBbox,
} from "../utils/helpers";

export interface MapStore {
  mapRef: MutableRefObject<maplibregl.Map | null> | null;
  setMapRef: (map: MutableRefObject<maplibregl.Map | null>) => void;
  mapDocument: DocumentObject | null;
  setMapDocument: (mapDocument: DocumentObject) => void;
  shatterIds: {
    parents: string[];
    children: string[];
  };
  setShatterIds: (
    existingParents: string[],
    existingChildren: string[],
    newParent: string[],
    newChildren: string[],
    multipleShattered: boolean
  ) => void;
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
  // TODO: Add parent/child status to zoneAssignments
  // Probably, something like Map<string, { zone: number, child?: boolean }>
  zoneAssignments: Map<string, number>; // geoid -> zone
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
    metrics: UseQueryResult<ZonePopulation[], Error> | null,
  ) => void;
  visibleLayerIds: string[];
  setVisibleLayerIds: (layerIds: string[]) => void;
  addVisibleLayerIds: (layerIds: string[]) => void;
  updateVisibleLayerIds: (layerIds: LayerVisibility[]) => void;
  contextMenu: ContextMenuState | null;
  setContextMenu: (menu: ContextMenuState | null) => void;
}

export const useMapStore = create(
  subscribeWithSelector<MapStore>((set, get) => ({
    mapRef: null,
    setMapRef: (mapRef) => set({ mapRef }),
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
      children: [],
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
        const zone = zoneAssignments.get(newParent[0]);
        zone &&
          newChildren.forEach((childId) => zoneAssignments.set(childId, zone));
      }

      set({
        shatterIds: {
          parents: [...existingParents, ...newParent],
          children: [...existingChildren, ...newChildren],
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
      assignments.forEach((assignment) => {
        zoneAssignments.set(assignment.geo_id, assignment.zone);
      });
      set({ zoneAssignments });
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
  })),
);

useMapStore.subscribe(
  (state) => state.mapDocument,
  (mapDocument) => {
    const mapStore = useMapStore.getState();
    if (mapStore.mapRef && mapDocument) {
      addBlockLayers(mapStore.mapRef, mapDocument);
      mapStore.addVisibleLayerIds([BLOCK_LAYER_ID, BLOCK_HOVER_LAYER_ID]);
    }
  },
);

useMapStore.subscribe(
  (state) => state.mapRef,
  (mapRef) => {
    const mapStore = useMapStore.getState();
    if (mapRef && mapStore.mapDocument) {
      addBlockLayers(mapRef, mapStore.mapDocument);
      mapStore.addVisibleLayerIds([BLOCK_LAYER_ID, BLOCK_HOVER_LAYER_ID]);
    }
  },
);

const _shatterMapSideEffectRender = useMapStore.subscribe(
  (state) => state.shatterIds,
  (shatterIds) => {
    const mapRef = useMapStore.getState().mapRef;

    if (!mapRef?.current) {
      return;
    }

    PARENT_LAYERS.forEach((layerId) =>
      mapRef.current?.setFilter(layerId, [
        "!",
        ["in", ["get", "path"], ["literal", shatterIds.parents]],
      ])
    );

    CHILD_LAYERS.forEach((layerId) =>
      mapRef.current?.setFilter(layerId, [
        "in",
        ["get", "path"],
        ["literal", shatterIds.children],
      ])
    );
  }
);

const _hoverMapSideEffectRender = useMapStore.subscribe(
  (state) => state.hoverFeatures,
  (hoverFeatures, previousHoverFeatures) => {
    const mapRef = useMapStore.getState().mapRef;

    if (!mapRef?.current) {
      return;
    }

    previousHoverFeatures.forEach((feature) => {
      mapRef.current?.setFeatureState(feature, { hover: false });
    });

    hoverFeatures.forEach((feature) => {
      mapRef.current?.setFeatureState(feature, { hover: true });
    });
  }
);

const _zoneAssignmentMapSideEffectRender = useMapStore.subscribe(
  (state) => ({
    zoneAssignments: state.zoneAssignments,
    mapDocument: state.mapDocument,
    mapRef: state.mapRef,
    shatterIds: state.shatterIds,
  }),
  (state) => {
    const { zoneAssignments, mapDocument, mapRef } = state;

    if (!mapRef?.current || !mapDocument) {
      return;
    }

    zoneAssignments.forEach((zone, id) => {
      // This is awful
      // we need information on whether an assignment is parent or child
      const isParent = id.toString().includes("vtd");
      const sourceLayer = isParent
        ? mapDocument.parent_layer
        : mapDocument.child_layer;

      if (!sourceLayer) {
        return;
      }

      mapRef.current?.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          id,
          sourceLayer,
        },
        {
          selected: true,
          zone,
        }
      );
    });
  }
);
