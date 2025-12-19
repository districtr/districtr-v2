import {useMapStore} from '@/app/store/mapStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import GeometryWorker from '@/app/utils/GeometryWorker';
import {LngLatBoundsLike} from 'maplibre-gl';
import {create} from 'zustand';
import {demographyCache} from '../utils/demography/demographyCache';

type UnassignedFeatureStore = {
  unassignedFeatureBboxes: GeoJSON.Feature[];
  unassignedOverallBbox: LngLatBoundsLike | null;
  hasFoundUnassigned: boolean;
  selectedIndex: number | null;
  lastUpdated: string | null;
  setSelectedIndex: (index: number | null) => void;
  reset: () => void;
  updateUnassignedFeatures: () => void;
};

export const useUnassignFeaturesStore = create<UnassignedFeatureStore>((set, get) => ({
  unassignedFeatureBboxes: [],
  unassignedOverallBbox: null,
  hasFoundUnassigned: false,
  selectedIndex: null,
  lastUpdated: null,
  setSelectedIndex: (index: number | null) => set({selectedIndex: index}),
  reset: () =>
    set({
      unassignedFeatureBboxes: [],
      unassignedOverallBbox: null,
      hasFoundUnassigned: false,
      selectedIndex: null,
    }),
  updateUnassignedFeatures: async () => {
    const {mapDocument, getMapRef} = useMapStore.getState();
    const {shatterIds} = useAssignmentsStore.getState();
    const mapRef = getMapRef();
    if (!GeometryWorker || !mapRef) return;
    // const expectedFeatures = demographyCache.table?.size;
    // const nSeen = Object.keys(await GeometryWorker.activeGeometries).length;
    // disabling local implementation for now
    const unassignedGeometries = await GeometryWorker.getUnassignedGeometries(
      mapDocument?.document_id,
      Array.from(shatterIds.parents)
    );

    set({
      hasFoundUnassigned: true,
      selectedIndex: null,
      unassignedOverallBbox: unassignedGeometries?.overall || null,
      unassignedFeatureBboxes: unassignedGeometries?.dissolved?.features || [],
      lastUpdated: new Date().toLocaleString(),
    });
  },
}));
