import {useMapStore} from '@/app/store/mapStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import GeometryWorker from '@/app/utils/GeometryWorker';
import {create} from 'zustand';
import {demographyService} from '../utils/demography/demographyService';
import {ACCESS_STATES} from '@constants/document/state';

type UnassignedFeatureStore = {
  unassignedFeatureBboxes: GeoJSON.Feature[];
  hasFoundUnassigned: boolean;
  selectedIndex: number | null;
  setSelectedIndex: (index: number | null) => void;
  reset: () => void;
  updateUnassignedFeatures: () => void;
};

export const useUnassignFeaturesStore = create<UnassignedFeatureStore>((set, get) => ({
  unassignedFeatureBboxes: [],
  hasFoundUnassigned: false,
  selectedIndex: null,
  setSelectedIndex: (index: number | null) => set({selectedIndex: index}),
  reset: () =>
    set({
      unassignedFeatureBboxes: [],
      hasFoundUnassigned: false,
      selectedIndex: null,
    }),
  updateUnassignedFeatures: async () => {
    const {mapDocument, getMapRef} = useMapStore.getState();
    const {shatterIds} = useAssignmentsStore.getState();
    const mapRef = getMapRef();
    if (!GeometryWorker || !mapRef) return;
    // const expectedFeatures = demographyService.table?.size;
    // const nSeen = Object.keys(await GeometryWorker.activeGeometries).length;
    // disabling local implementation for now
    const documentIdParam =
      mapDocument?.access === ACCESS_STATES.READ && mapDocument?.public_id
        ? String(mapDocument.public_id)
        : mapDocument?.document_id;
    const unassignedGeometries = await GeometryWorker.getUnassignedGeometries(
      documentIdParam,
      Array.from(shatterIds.parents)
    );

    set({
      hasFoundUnassigned: true,
      selectedIndex: null,
      unassignedFeatureBboxes: unassignedGeometries?.dissolved?.features || [],
    });
  },
}));
