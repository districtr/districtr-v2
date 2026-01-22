'use client';
import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import type {MapOptions} from 'maplibre-gl';
import {FALLBACK_NUM_DISTRICTS, OVERLAY_OPACITY} from '../constants/mapDefaults';
import {ActiveTool, NullableZone, SpatialUnit, Zone} from '../constants/types';
import {DistrictrMapOptions} from './types';
import {useAssignmentsStore} from './assignmentsStore';
import {useMapStore} from './mapStore';
import {PaintEventHandler} from '@utils/map/types';
import {getFeaturesInBbox} from '@utils/map/getFeaturesInBbox';

type SidebarPanel = 'layers' | 'population' | 'demography' | 'election' | 'mapValidation' | 'overlays';

export interface MapControlsStore {
  selectedZone: Zone;
  setSelectedZone: (zone: Zone) => void;
  isPainting: boolean;
  setIsPainting: (isPainting: boolean) => void;
  isEditing: boolean;
  setIsEditing: (isEditing: boolean) => void;
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
  paintFunction: PaintEventHandler;
  setPaintFunction: (paintFunction: PaintEventHandler) => void;
  mapOptions: MapOptions & DistrictrMapOptions;
  setMapOptions: (options: Partial<MapControlsStore['mapOptions']>) => void;
  setLockedZones: (zones: Array<NullableZone>) => void;
  toggleLockAllAreas: () => void;
  spatialUnit: SpatialUnit;
  setSpatialUnit: (unit: SpatialUnit) => void;
  sidebarPanels: SidebarPanel[];
  setSidebarPanels: (panels: SidebarPanel[]) => void;
}

export const DEFAULT_MAP_OPTIONS: MapOptions & DistrictrMapOptions = {
  center: [-98.5795, 39.8283],
  zoom: 3,
  pitch: 0,
  bearing: 0,
  container: '',
  bounds: undefined,
  currentStateFp: undefined,
  highlightBrokenDistricts: false,
  higlightUnassigned: false,
  lockPaintedAreas: [],
  mode: 'default',
  paintByCounty: false,
  prominentCountyNames: true,
  showCountyBoundaries: true,
  showPaintedDistricts: true,
  showZoneNumbers: true,
  showPopulationTooltip: false,
  showBlockPopulationNumbers: false,
  showPopulationNumbers: false,
  showDemographicMap: undefined,
  overlayOpacity: OVERLAY_OPACITY,
};

export const useMapControlsStore = create<MapControlsStore>()(
  subscribeWithSelector((set, get) => ({
    selectedZone: 1,
    setSelectedZone: zone => {
      const numDistricts =
        useMapStore.getState().mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS;
      if (zone <= numDistricts && !get().isPainting) {
        set({selectedZone: zone});
      }
    },
    isPainting: false,
    setIsPainting: isPainting => {
      if (!isPainting) {
        useAssignmentsStore.getState().ingestAccumulatedAssignments();
      }
      set({isPainting});
    },
    isEditing: false,
    setIsEditing: isEditing => set({isEditing}),
    activeTool: 'pan',
    setActiveTool: tool => {
      const canEdit = useMapStore.getState().mapStatus?.access === 'edit';
      if (canEdit) {
        set({activeTool: tool});
      }
    },
    brushSize: 1,
    setBrushSize: brushSize => set({brushSize}),
    paintFunction: getFeaturesInBbox,
    setPaintFunction: paintFunction => set({paintFunction}),
    mapOptions: DEFAULT_MAP_OPTIONS,
    setMapOptions: options => set({mapOptions: {...get().mapOptions, ...options}}),
    setLockedZones: zones =>
      set({
        mapOptions: {
          ...get().mapOptions,
          lockPaintedAreas: zones,
        },
      }),
    toggleLockAllAreas: () => {
      const {mapOptions} = get();
      const numDistricts =
        useMapStore.getState().mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS;
      const nextLockPaintedAreas = mapOptions.lockPaintedAreas.length
        ? []
        : Array.from({length: numDistricts}, (_, i) => (i + 1) as NullableZone);
      set({
        mapOptions: {
          ...mapOptions,
          lockPaintedAreas: nextLockPaintedAreas,
        },
      });
    },
    spatialUnit: 'tract',
    setSpatialUnit: spatialUnit => set({spatialUnit}),
    sidebarPanels: ['population'],
    setSidebarPanels: sidebarPanels => set({sidebarPanels}),
  }))
);
