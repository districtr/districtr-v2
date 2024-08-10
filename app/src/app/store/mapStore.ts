import type { MapOptions } from "maplibre-gl";
import { create } from "zustand";
import type { ActiveTool, SpatialUnit } from "../constants/types";
import { Zone, GDBPath } from "../constants/types";
import { gerryDBView } from "../api/apiHandlers";
import { addBlockLayers, removeBlockLayers } from "../constants/layers";
import maplibregl from "maplibre-gl";
import type { MutableRefObject } from "react";

export interface MapStore {
  mapRef: MutableRefObject<maplibregl.Map | null> | null;
  setMapRef: (map: MutableRefObject<maplibregl.Map>) => void;
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
  setMapRef: (mapRef: MutableRefObject<maplibregl.Map | null> | null) =>
    set({ mapRef: mapRef }),
  /**
   * Unique identifier for the map instance
   * @type {string | null}
   */
  documentId: null,
  setDocumentId: (documentId: string) => set({ documentId: documentId }),
  /**
   * Layer currently selected by the user
   * @type {gerryDBView | null}
   */
  selectedLayer: null,
  setSelectedLayer: (layer: gerryDBView) =>
    set((state: MapStore) => {
      if (state.mapRef) {
        removeBlockLayers(state.mapRef);
        addBlockLayers(state.mapRef, layer);
      }
      return { selectedLayer: layer };
    }),
  /**
   * maplibre map instance options
   * @type {MapOptions}
   */
  mapOptions: {
    center: [-98.5795, 39.8283],
    zoom: 3,
    pitch: 0,
    bearing: 0,
    container: "",
  },
  setMapOptions: (options: MapOptions) => set({ mapOptions: options }),
  /**
   * Selected tool for the user to interact with the map
   * @type {ActiveTool}
   */
  activeTool: "pan",
  setActiveTool: (tool: ActiveTool) => set({ activeTool: tool }),
  /**
   * Spatial unit of geometry available to the user
   * @type {SpatialUnit}
   */
  spatialUnit: "tract",
  setSpatialUnit: (unit: SpatialUnit) => set({ spatialUnit: unit }),
  /**
   * Precinct zone currently being used to assign geoids via painting
   * @type {Zone}
   */
  selectedZone: 1,
  setSelectedZone: (zone: Zone) => set({ selectedZone: zone }),
  /**
   * Dictionary of geoid: zone assignments
   * @type {Map<string, number>}
   */
  zoneAssignments: new Map(),
  /**
   * Set of geoids that have been assigned to a zone
   * @type {Set<string>}
   */
  accumulatedGeoids: new Set<string>(),
  /**
   *
   * @param zone - identifier for the zone assignment
   * @param paths - Set of paths to assign to the zone; members of the set will be assigned to the zone
   * @returns updated dict of geoid: zone assignments
   */
  setZoneAssignments: (zone: Zone, gdbPaths: Set<GDBPath>) =>
    set((state) => {
      const newZoneAssignments = new Map([...state.zoneAssignments]);
      gdbPaths.forEach((gdpPath) => {
        newZoneAssignments.set(gdpPath, zone);
      });
      return {
        zoneAssignments: newZoneAssignments,
        accumulatedGeoids: new Set<string>(),
      };
    }),
  resetZoneAssignments: () => set({ zoneAssignments: new Map() }),

  /**
   * Size of the brush for painting in pixels
   * @type {number}
   */
  brushSize: 50,
  setBrushSize: (size: number) => set({ brushSize: size }),
  /**
   * Flag to determine if the user is currently painting on the map
   * @type boolean
   * @default false
   */
  isPainting: false,
  setIsPainting: (isPainting: boolean) => set({ isPainting: isPainting }),
  /**
   * Clear all edits on the map
   */
  clearMapEdits: () =>
    set({
      zoneAssignments: new Map(),
      accumulatedGeoids: new Set<string>(),
      selectedZone: 1,
    }),
  /**
   * Flag to determine if the map is fresh or has been edited
   * @type boolean
   * @default false
   * @description
   * Used to determine if the user has made edits to the map
   */
  freshMap: false,
  setFreshMap: (resetMap: boolean) => set({ freshMap: resetMap }),
  /* Next router instance
   * @type any
   */
  router: null,
  setRouter: (router: any) => set({ router: router }),
  /**
   * Current pathname
   * @type string
   */
  pathname: "",
  setPathname: (pathname: string) => set({ pathname: pathname }),
  /**
   * URL search params
   * @type URLSearchParams
   */
  urlParams: new URLSearchParams(),
  setUrlParams: (params: URLSearchParams) => set({ urlParams: params }),
}));
