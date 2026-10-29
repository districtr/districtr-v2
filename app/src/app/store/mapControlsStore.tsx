'use client';
import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import type {MapOptions} from 'maplibre-gl';
import {FALLBACK_NUM_DISTRICTS, OVERLAY_OPACITY} from '@/app/constants/document/limits';
import {MAP_MODES, type MapMode} from '@constants/map/mode';
import {MAP_MODE_DEFAULT_OPTIONS} from '@constants/map/mapModeDefaults';
import {ACTIVE_TOOLS, DISTRICT_EDIT_TOOLS, type ActiveTool} from '@constants/map/tools';
import {NullableZone, Zone} from '@constants/map/zone';
import {SpatialUnit} from '@constants/map/geography';
import {DistrictrMapOptions} from './types';
import {useMapStore} from './mapStore';
import {PaintEventHandler} from '@utils/map/types';
import {getFeaturesInBbox} from '@utils/map/getFeaturesInBbox';
import {getFeatureUnderCursor} from '@utils/map/getFeatureUnderCursor';
import {paintFunctionFor} from '@utils/map/paintBy';
import {shallow} from 'zustand/shallow';
import {ACCESS_STATES} from '@constants/document/state';
import {exposeStoreToWindow as _exposeControlsStore} from './exposeToWindow';

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
  isEval: boolean;
  setIsEval: (isEval: boolean) => void;
  /**
   * UUID of the editable document for the current map session. Retained across
   * Edit→Display→Eval client navigations (which load the doc read-only via its
   * public_id and surface document_id as "anonymous") so the view switcher can
   * route back to the edit view. Null when the user has no edit access.
   */
  editableDocId: string | null;
  setEditableDocId: (id: string | null) => void;
  /** Active full-screen transition overlay shown while navigating into the
   * display/evaluate view; null when no transition is in progress. */
  viewTransition: 'display' | 'evaluate' | null;
  setViewTransition: (transition: 'display' | 'evaluate' | null) => void;
  /** Last visible map bounds (captured on moveend) used to preserve the viewport
   * when switching between the edit/display/evaluate views of the same map. */
  lastViewBounds: [number, number, number, number] | null;
  setLastViewBounds: (bounds: [number, number, number, number] | null) => void;
  /** True when the current map is a password-protected plan that can be unlocked
   * for editing (observed via the `?pw=true` share link). Lets the view switcher
   * offer "Unlock to draw and paint districts". Reset when a different map loads. */
  passwordUnlockable: boolean;
  setPasswordUnlockable: (unlockable: boolean) => void;
  activeTool: ActiveTool;
  /** Paint by blocks before a unit is broken: Paint or Erase first picks the
   * unit (activeTool is then the internal break tool), and this is the tool to
   * return to inside it. The toolbar shows it as the active tool meanwhile. */
  blockPaintTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  /** Re-apply the Paint by blocks rule to the current tool: back to picking a
   * unit after leaving block view, or out of it after leaving Blocks. */
  syncBlockPicking: () => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
  /** Derived from activeTool + mapOptions.paintBy (subscription below). */
  paintFunction: PaintEventHandler;
  mapOptions: MapOptions & DistrictrMapOptions;
  setMapOptions: (options: Partial<MapControlsStore['mapOptions']>) => void;
  setStateFp: (stateFp: string) => void;
  hoveredCountyGeoid: string | null;
  setHoveredCountyGeoid: (geoid: string | null) => void;
  setLockedZones: (zones: Array<NullableZone>) => void;
  toggleLockAllAreas: () => void;
  spatialUnit: SpatialUnit;
  setSpatialUnit: (unit: SpatialUnit) => void;
  sidebarPanels: SidebarPanel[];
  setSidebarPanels: (panels: SidebarPanel[]) => void;
  /** Workflow-tab sections a user collapsed (sections default open, so absent
   * = open). Lives here rather than in TabSection state because tab content
   * unmounts on switch. */
  collapsedTabSections: string[];
  toggleTabSection: (id: string) => void;
  /** Un-collapse a section (helper-box hints jump to sections and must land
   * them expanded). */
  openTabSection: (id: string) => void;
  mapMode: MapMode;
  setMapMode: (mode: MapMode) => void;
}

const initialMapMode: MapControlsStore['mapMode'] = MAP_MODES.DISTRICTS;

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
  disallowPaintOver: false,
  mode: 'default',
  // Real default is computed per-document in useDocumentWithSync (multi-county
  // unless the map is DC or already has assignments) — this is just the
  // pre-load fallback before that runs.
  paintBy: 'units',
  prominentCountyNames: true,
  showCountyBoundaries: true,
  showPaintedDistricts: true,
  showZoneNumbers: true,
  showPopulationTooltip: false,
  showBlockPopulationNumbers: false,
  showPopulationNumbers: false,
  demographicDisplayMode: undefined,
  overlayOpacity: OVERLAY_OPACITY,
  zonesOpacity: 1,
  basemap: MAP_MODE_DEFAULT_OPTIONS.districts.basemap,
};

/** The tool the UI shows as active: while Paint by blocks is picking a unit,
 * activeTool is the internal SHATTER and this is the Paint/Erase it stands in for. */
export const selectShownTool = (state: Pick<MapControlsStore, 'activeTool' | 'blockPaintTool'>) =>
  state.activeTool === ACTIVE_TOOLS.SHATTER ? state.blockPaintTool : state.activeTool;

export const useMapControlsStore = create<MapControlsStore>()(
  subscribeWithSelector((set, get) => ({
    selectedZone: 1,
    mapMode: initialMapMode,
    setMapMode: mode => set({mapMode: mode}),
    setSelectedZone: zone => {
      const mapStore = useMapStore.getState();
      const validZone =
        get().mapMode === MAP_MODES.COI
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
    isEval: false,
    setIsEval: isEval => set({isEval}),
    editableDocId: null,
    setEditableDocId: editableDocId => set({editableDocId}),
    viewTransition: null,
    setViewTransition: viewTransition => set({viewTransition}),
    lastViewBounds: null,
    setLastViewBounds: lastViewBounds => set({lastViewBounds}),
    passwordUnlockable: false,
    setPasswordUnlockable: passwordUnlockable => set({passwordUnlockable}),
    activeTool: ACTIVE_TOOLS.PAN,
    blockPaintTool: ACTIVE_TOOLS.BRUSH,
    setActiveTool: tool => {
      const {mapStatus, captiveIds} = useMapStore.getState();
      if (mapStatus?.access !== ACCESS_STATES.EDIT) return;
      const pickUnitToBreak =
        (tool === ACTIVE_TOOLS.BRUSH || tool === ACTIVE_TOOLS.ERASER) &&
        get().mapOptions.paintBy === 'blocks' &&
        !captiveIds.size;
      set(
        pickUnitToBreak
          ? {activeTool: ACTIVE_TOOLS.SHATTER, blockPaintTool: tool}
          : {activeTool: tool}
      );
    },
    syncBlockPicking: () => get().setActiveTool(selectShownTool(get())),
    brushSize: 1,
    setBrushSize: brushSize => set({brushSize}),
    paintFunction: getFeaturesInBbox,
    mapOptions: DEFAULT_MAP_OPTIONS,
    setMapOptions: options => {
      const mapOptions = {...get().mapOptions, ...options};
      // Edit tools are disabled while painted districts are hidden; drop an
      // active one to Move so it can't keep editing.
      const dropEditTool =
        mapOptions.showPaintedDistricts === false && DISTRICT_EDIT_TOOLS.includes(get().activeTool);
      set(dropEditTool ? {mapOptions, activeTool: ACTIVE_TOOLS.PAN} : {mapOptions});
    },
    hoveredCountyGeoid: null,
    setHoveredCountyGeoid: geoid => set({hoveredCountyGeoid: geoid}),
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
      } else if (mapMode === MAP_MODES.COI) {
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
    collapsedTabSections: [],
    openTabSection: id =>
      set(state => ({collapsedTabSections: state.collapsedTabSections.filter(k => k !== id)})),
    toggleTabSection: id =>
      set(state => ({
        collapsedTabSections: state.collapsedTabSections.includes(id)
          ? state.collapsedTabSections.filter(k => k !== id)
          : [...state.collapsedTabSections, id],
      })),
  }))
);

// The brush's feature picker follows the active tool and Paint by, however
// either changes (an action or a plain setState), so no writer keeps it in step.
useMapControlsStore.subscribe(
  state => [state.activeTool, state.mapOptions.paintBy] as const,
  ([activeTool, paintBy]) =>
    useMapControlsStore.setState({
      paintFunction:
        activeTool === ACTIVE_TOOLS.SHATTER ? getFeatureUnderCursor : paintFunctionFor(paintBy),
    }),
  {equalityFn: shallow}
);

_exposeControlsStore('mapControlsStore', useMapControlsStore);
