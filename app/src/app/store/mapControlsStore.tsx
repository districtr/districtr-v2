'use client';
import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import type {MapOptions} from 'maplibre-gl';
import {FALLBACK_NUM_DISTRICTS, OVERLAY_OPACITY} from '@constants/map/mapDefaults';
import {MAP_MODE_DEFAULT_OPTIONS, type MapMode} from '@constants/map/mapModeDefaults';
import {ACTIVE_TOOLS, type ActiveTool, NullableZone, SpatialUnit, Zone} from '@constants/types';
import {DistrictrMapOptions} from './types';
import {BasemapId} from '@/app/constants/map/layerStyle';
import {useMapStore} from './mapStore';
import {PaintEventHandler} from '@utils/map/types';
import {getFeaturesInBbox} from '@utils/map/getFeaturesInBbox';

type SidebarPanel =
  | 'layers'
  | 'population'
  | 'demography'
  | 'election'
  | 'mapValidation'
  | 'overlays';

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
  setStateFp: (stateFp: string) => void;
  setLockedZones: (zones: Array<NullableZone>) => void;
  toggleLockAllAreas: () => void;
  spatialUnit: SpatialUnit;
  setSpatialUnit: (unit: SpatialUnit) => void;
  sidebarPanels: SidebarPanel[];
  setSidebarPanels: (panels: SidebarPanel[]) => void;
  mapMode: MapMode;
  setMapMode: (mode: MapMode) => void;
}

const initialMapMode: MapControlsStore['mapMode'] = 'districts';

export const DEFAULT_MAP_OPTIONS: MapOptions & DistrictrMapOptions = {
  center: [-98.5795, 39.8283],
  zoom: 3,
  pitch: 0,
  bearing: 0,
  container: '',
  bounds: undefined,
  stateFipsSet: undefined,
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
  basemap: MAP_MODE_DEFAULT_OPTIONS.districts.basemap,
};

export const useMapControlsStore = create<MapControlsStore>()(
  subscribeWithSelector((set, get) => ({
    selectedZone: 1,
    mapMode: initialMapMode,
    setMapMode: mode => set({mapMode: mode}),
    setSelectedZone: zone => {
      const mapStore = useMapStore.getState();
      const validZone =
        get().mapMode === 'coi'
          ? mapStore.communities.some(community => community.id === zone)
          : zone <= (mapStore.mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS);
      if (validZone && !get().isPainting) {
        set({selectedZone: zone});
      }
    },
    isPainting: false,
    setIsPainting: isPainting => set({isPainting}),
    isEditing: false,
    setIsEditing: isEditing => set({isEditing}),
    activeTool: ACTIVE_TOOLS.PAN,
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
    setStateFp: stateFp => {
      const mapOptions = get().mapOptions;
      const stateFipsSet = mapOptions.stateFipsSet;
      if (!stateFipsSet) {
        set({mapOptions: {...mapOptions, stateFipsSet: new Set([stateFp])}});
      } else if (stateFipsSet.has(stateFp)) {
        // Do nothing and do not trigger a re-render
        return;
      } else {
        const newSet = new Set(stateFipsSet);
        newSet.add(stateFp);
        set({mapOptions: {...mapOptions, stateFipsSet: newSet}});
      }
    },
    setLockedZones: zones =>
      set({
        mapOptions: {
          ...get().mapOptions,
          lockPaintedAreas: zones,
        },
      }),
    toggleLockAllAreas: () => {
      const {mapMode, mapOptions} = get();
      const mapStore = useMapStore.getState();
      const shouldUnlockAllAreas = mapOptions.lockPaintedAreas.length > 0;
      let nextLockPaintedAreas: Array<NullableZone>;

      if (shouldUnlockAllAreas) {
        nextLockPaintedAreas = [];
      } else if (mapMode === 'coi') {
        nextLockPaintedAreas = mapStore.communities.map(community => community.id as NullableZone);
      } else {
        const numDistricts = mapStore.mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS;
        nextLockPaintedAreas = Array.from(
          {length: numDistricts},
          (_, i) => (i + 1) as NullableZone
        );
      }

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
