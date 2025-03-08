import {useChartStore} from '@/app/store/chartStore';
import {idCache} from '@/app/store/idCache';
import {useMapStore} from '@/app/store/mapStore';
import GeometryWorker from '@/app/utils/GeometryWorker';
import {LngLatBoundsLike} from 'maplibre-gl';
import {create} from 'zustand';

type UnassignedFeatureStore = {
  unassignedFeatureBboxes: GeoJSON.Feature[];
  unassignedOverallBbox: LngLatBoundsLike | null;
  hasFoundUnassigned: boolean;
  selectedIndex: number | null;
  lastUpdated: string | null;
  changeSelectedIndex: (amount: number) => void;
  setSelectedIndex: (index: number | null) => void;
  reset: () => void;
  updateUnassignedFeatures: () => void;
};

export const useUnassignFeaturesStore = create<UnassignedFeatureStore>((set,get) => ({
  unassignedFeatureBboxes: [],
  unassignedOverallBbox: null,
  hasFoundUnassigned: false,
  selectedIndex: null,
  lastUpdated: null,
  changeSelectedIndex: (amount: number) => {
    const {selectedIndex, unassignedFeatureBboxes} = get();
    const prevIndex = selectedIndex || 0;
    const newIndex = prevIndex + amount;
    if (newIndex < 0 || newIndex >= unassignedFeatureBboxes.length) return;
    set({selectedIndex: newIndex});
  },
  setSelectedIndex: (index: number | null) => set({selectedIndex: index}),
  reset: () =>
    set({
      unassignedFeatureBboxes: [],
      unassignedOverallBbox: null,
      hasFoundUnassigned: false,
      selectedIndex: null,
    }),
  updateUnassignedFeatures: async () => {
    const {shatterIds, zoneAssignments, mapDocument, getMapRef} = useMapStore.getState();
    const mapRef = getMapRef();
    if (!GeometryWorker || !mapRef) return;
    const useBackend =
      idCache.getTotalPopSeen(shatterIds.parents) !== useChartStore.getState().chartInfo.totPop;
    if (!useBackend) {
      await GeometryWorker.updateProps(Array.from(zoneAssignments.entries()));
    }
    const unassignedGeometries = await GeometryWorker.getUnassignedGeometries(
      useBackend,
      mapDocument?.document_id,
      Array.from(shatterIds.parents)
    );

    set({
      hasFoundUnassigned: true,
      selectedIndex: null,
      unassignedOverallBbox: unassignedGeometries?.overall || null,
      unassignedFeatureBboxes: unassignedGeometries?.dissolved?.features || [],
      lastUpdated: new Date().toLocaleTimeString(),
    });
  },
}));
