import {useChartStore} from '@/app/store/chartStore';
import { idCache } from '@/app/store/idCache';
import {useMapStore} from '@/app/store/mapStore';
import GeometryWorker from '@/app/utils/GeometryWorker';
import {LngLatBoundsLike} from 'maplibre-gl';
import { create } from 'zustand';

type UnassignedFeatureStore = {
  unassignedFeatureBboxes: GeoJSON.Feature[];
  unassignedOverallBbox: LngLatBoundsLike | null;
  hasFoundUnassigned: boolean;
  selectedIndex: number | null;
  setSelectedIndex: (index: number | null) => void;
  reset: () => void;
  updateUnassignedFeatures: () => void;
}

export const useUnassignFeaturesStore = create<UnassignedFeatureStore>((set) => ({
  unassignedFeatureBboxes: [],
  unassignedOverallBbox: null,
  hasFoundUnassigned: false,
  selectedIndex: null,
  setSelectedIndex: (index: number | null) => set({ selectedIndex: index }),
  reset: () => set({ unassignedFeatureBboxes: [], unassignedOverallBbox: null, hasFoundUnassigned: false, selectedIndex: null }),
  updateUnassignedFeatures: async () => {
    const { shatterIds, zoneAssignments, mapDocument, getMapRef } = useMapStore.getState();
    const mapRef = getMapRef();
    if (!GeometryWorker || !mapRef) return;
    const useBackend = idCache.getTotalPopSeen(shatterIds.parents) !== useChartStore.getState().chartInfo.totPop

    if (!useBackend) {
      await GeometryWorker.updateProps(Array.from(zoneAssignments.entries()))
    }
    const unassignedGeometries = await GeometryWorker.getUnassignedGeometries(useBackend, mapDocument?.document_id)

    set({
      hasFoundUnassigned: true,
      selectedIndex: null,
      unassignedOverallBbox: unassignedGeometries?.overall || null,
      unassignedFeatureBboxes: unassignedGeometries?.dissolved?.features || []
    })
  }
}));
