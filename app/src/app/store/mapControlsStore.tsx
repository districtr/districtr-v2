'use client';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { MapOptions } from 'maplibre-gl';
import { FALLBACK_NUM_DISTRICTS, OVERLAY_OPACITY } from '../constants/mapDefaults';
import { ActiveTool, NullableZone, SpatialUnit, Zone } from '../constants/types';
import { DistrictrMapOptions, CommunityMapOptions, Community, makeCommunity } from './types';
import { useAssignmentsStore } from './assignmentsStore';
import { useMapStore } from './mapStore';
import { PaintEventHandler } from '@utils/map/types';
import { getFeaturesInBbox } from '@utils/map/getFeaturesInBbox';
import { communityAssignments } from '../utils/community/communityAssignments';

type SidebarPanel =
  | 'layers'
  | 'population'
  | 'demography'
  | 'election'
  | 'mapValidation'
  | 'overlays';

export interface MapControlsStore {
  selectedZone: Zone;
  communityList: Community[];
  selectedCommunityId: number;
  setSelectedCommunityId: (communityId: number) => void;
  addCommunity: () => void;
  removeCommunities: (ids: number[]) => void;
  setCommunityName: (communityId: number, newName: string) => void;
  setCommunityColor: (communityId: number, newColor: string) => void;
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
  mapOptions: MapOptions & DistrictrMapOptions & CommunityMapOptions;
  setMapOptions: (options: Partial<MapControlsStore['mapOptions']>) => void;
  setStateFp: (stateFp: string) => void;
  setLockedZones: (zones: Array<NullableZone>) => void;
  toggleLockAllAreas: () => void;
  spatialUnit: SpatialUnit;
  setSpatialUnit: (unit: SpatialUnit) => void;
  sidebarPanels: SidebarPanel[];
  setSidebarPanels: (panels: SidebarPanel[]) => void;
}

export const DEFAULT_MAP_OPTIONS: MapOptions & DistrictrMapOptions & CommunityMapOptions = {
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
  paintCommunity: true,
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
        set({ selectedZone: zone });
      }
    },
    // Let's make it so that "id" is the same as "postion in the array" to make it faster
    // to grab attributes of the community without having to loop through the array to find
    // the right community object later. The "displayPosition" attribute will control order of
    // display in the UI, so that we can restore things later.
    communityList: [makeCommunity({ id: 0, displayPosition: 0 })],
    selectedCommunityId: 0,
    setSelectedCommunityId: communityId => set({ selectedCommunityId: communityId }),
    addCommunity: () => {
      const { communityList: communities } = get();
      if (communities.length >= communityAssignments.getMaxCommunities()) return;

      let nextId = 0;
      const allIds = new Set(communities.map(c => c.id));

      for (let i = 1; i <= allIds.size + 1; i++) {
        if (!allIds.has(i)) {
          nextId = i;
          break;
        }
      }

      const newCommunity = makeCommunity({
        id: nextId,
        displayPosition:
          communities.reduce((max, c) => (c.displayPosition > max ? c.displayPosition : max), -1) +
          1,
      });
      set({ communityList: [...communities, newCommunity], selectedCommunityId: nextId });
    },
    removeCommunities: (ids: number[]) => {
      const { communityList, selectedCommunityId } = get();
      const selectedCommunity = communityList.find(c => c.id === selectedCommunityId);
      const currentPosition = selectedCommunity?.displayPosition ?? 0;
      const idsToRemove = new Set(ids);
      // If any broken geometries were assigned to removed communities, attempt a heal pass.
      const {
        childToParent,
        shatterIds,
        healParentsIfAllChildrenInSameZone,
        queueCommunityGeoids,
        flushCommunityAssignments,
      } = useAssignmentsStore.getState();
      const parentsToCheck = new Set<string>();
      const geoidsToRepaint = new Set<string>();
      ids.forEach(id => {
        const geoids = communityAssignments.getGeoidsForCommunity(id, true);
        geoids.forEach(geoid => {
          geoidsToRepaint.add(geoid);
          if (shatterIds.children.has(geoid)) {
            const parentId = childToParent.get(geoid);
            parentId && parentsToCheck.add(parentId);
          }
        });
      });

      ids.forEach(id => communityAssignments.clearAssignmentsForCommunity(id));
      communityAssignments.compactAssignedGeomIndices();

      if (parentsToCheck.size) {
        healParentsIfAllChildrenInSameZone({ _parentIds: parentsToCheck }, 'state');
      }
      if (geoidsToRepaint.size) {
        queueCommunityGeoids(geoidsToRepaint);
        flushCommunityAssignments();
      }
      const newCommunityList = communityList.filter(c => !idsToRemove.has(c.id));
      // Now find the item with the displayPosition below the selected Community that isn't being
      // removed, and set that as the new selected community. If there isn't one, set the selected
      // community to 0 (the "unassigned" community)
      // const maxRemainingDisplayBelowRemoved = newCommunityList.filter(
      //   c => c.displayPosition < currentPosition
      // );
      //
      // const maxBelowPos = Math.max(
      //   -Infinity,
      //   ...maxRemainingDisplayBelowRemoved.map(c => c.displayPosition)
      // );
      // const nextSelected =
      //   maxRemainingDisplayBelowRemoved.find(c => c.displayPosition === maxBelowPos)?.id ?? 0;

      const nextSelected = idsToRemove.has(selectedCommunityId)
        ? (newCommunityList
          .filter(c => c.displayPosition < currentPosition)
          .reduce<{ id: number; displayPosition: number } | null>((best, c) => {
            if (!best || c.displayPosition > best.displayPosition) {
              return { id: c.id, displayPosition: c.displayPosition };
            }
            return best;
          }, null)?.id ?? 0)
        : selectedCommunityId;
      // now update the display positions to be sequential starting from 0, to maintain our
      set({ communityList: newCommunityList, selectedCommunityId: nextSelected });
    },
    setCommunityName: (communityId: number, newName: string) => {
      // Following functional update example at
      // https://github.com/pmndrs/zustand/blob/main/docs/guides/updating-state.md?utm_source=chatgpt.com#normal-approach
      // Should make it so we don't accidentally capture stale state when this function is used in
      // a component
      set(state => ({
        communityList: state.communityList.map(c =>
          c.id === communityId ? { ...c, name: newName } : c
        ),
      }));
    },
    setCommunityColor: (communityId: number, newColor: string) => {
      set(state => ({
        communityList: state.communityList.map(c =>
          c.id === communityId ? { ...c, color: newColor } : c
        ),
      }));
    },
    isPainting: false,
    setIsPainting: isPainting => {
      if (!isPainting) {
        const { mapOptions } = get();
        if (mapOptions.paintCommunity) {
          useAssignmentsStore.getState().flushCommunityAssignments();
        } else {
          useAssignmentsStore.getState().ingestAccumulatedAssignments();
        }
      }
      set({ isPainting });
    },
    isEditing: false,
    setIsEditing: isEditing => set({ isEditing }),
    activeTool: 'pan',
    setActiveTool: tool => {
      const canEdit = useMapStore.getState().mapStatus?.access === 'edit';
      if (canEdit) {
        set({ activeTool: tool });
      }
    },
    brushSize: 1,
    setBrushSize: brushSize => set({ brushSize }),
    paintFunction: getFeaturesInBbox,
    setPaintFunction: paintFunction => set({ paintFunction }),
    mapOptions: DEFAULT_MAP_OPTIONS,
    setMapOptions: options => set({ mapOptions: { ...get().mapOptions, ...options } }),
    setStateFp: stateFp => {
      const mapOptions = get().mapOptions;
      const stateFipsSet = mapOptions.stateFipsSet;
      if (!stateFipsSet) {
        set({ mapOptions: { ...mapOptions, stateFipsSet: new Set([stateFp]) } });
      } else if (stateFipsSet.has(stateFp)) {
        // Do nothing and do not trigger a re-render
        return;
      } else {
        const newSet = new Set(stateFipsSet);
        newSet.add(stateFp);
        set({ mapOptions: { ...mapOptions, stateFipsSet: newSet } });
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
      const { mapOptions } = get();
      const numDistricts =
        useMapStore.getState().mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS;
      const nextLockPaintedAreas = mapOptions.lockPaintedAreas.length
        ? []
        : Array.from({ length: numDistricts }, (_, i) => (i + 1) as NullableZone);
      set({
        mapOptions: {
          ...mapOptions,
          lockPaintedAreas: nextLockPaintedAreas,
        },
      });
    },
    spatialUnit: 'tract',
    setSpatialUnit: spatialUnit => set({ spatialUnit }),
    sidebarPanels: ['population'],
    setSidebarPanels: sidebarPanels => set({ sidebarPanels }),
  }))
);
