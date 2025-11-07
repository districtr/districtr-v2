import {create} from 'zustand';
import {ActiveTool, SpatialUnit, Zone} from '../constants/types';
import {FALLBACK_NUM_DISTRICTS} from '../constants/layers';
import type {MapOptions} from 'maplibre-gl';
import {DistrictrMapOptions} from './types';
import {OVERLAY_OPACITY} from '../constants/layers';
import {useAssignmentsStore} from './assignmentsStore';
interface MapControlsStore {
  selectedZone: Zone;
  setSelectedZone: (zone: Zone) => void;
  isPainting: boolean;
  setIsPainting: (isPainting: boolean) => void;
  // EDITING MODE
  isEditing: boolean;
  setIsEditing: (isEditing: boolean) => void;
  mapOptions: MapOptions & DistrictrMapOptions;
  setMapOptions: (options: Partial<MapControlsStore['mapOptions']>) => void;
  // HIGHLIGHT
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  spatialUnit: SpatialUnit;
  setSpatialUnit: (unit: SpatialUnit) => void;
  sidebarPanels: Array<'layers' | 'population' | 'demography' | 'election' | 'mapValidation'>;
  setSidebarPanels: (panels: MapControlsStore['sidebarPanels']) => void;
}

export const useMapControlsStore = create<MapControlsStore>((set, get) => ({
  selectedZone: 1,
  setSelectedZone: zone => {
    const numDistricts =
      useAssignmentsStore.getState().mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS;
    if (zone <= numDistricts && !get().isPainting) {
      set({
        selectedZone: zone,
      });
    }
  },
  isPainting: false,
  setIsPainting: isPainting => {
    if (!isPainting) useAssignmentsStore.getState().ingestAccumulatedGeoids();
    set({isPainting});
  },

  isEditing: false,
  setIsEditing: (isEditing: boolean) => set({isEditing}),
  mapOptions: {
    center: [-98.5795, 39.8283],
    zoom: 3,
    pitch: 0,
    bearing: 0,
    container: '',
    highlightBrokenDistricts: false,
    mode: 'default',
    lockPaintedAreas: [],
    prominentCountyNames: true,
    showCountyBoundaries: true,
    showPaintedDistricts: true,
    showZoneNumbers: true,
    overlayOpacity: OVERLAY_OPACITY,
  },
  setMapOptions: options => set({mapOptions: {...get().mapOptions, ...options}}),
  activeTool: 'pan',
  setActiveTool: tool => {
    const canEdit = get().mapDocument?.access === 'edit';
    if (canEdit) {
      set({activeTool: tool});
    }
  },
  spatialUnit: 'tract',
  setSpatialUnit: unit => set({spatialUnit: unit}),
  sidebarPanels: ['population'],
  setSidebarPanels: sidebarPanels => set({sidebarPanels}),
}));
