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
    const newFeatures = unassignedGeometries?.dissolved?.features || [];

    // Keep the list a stable checklist across refreshes: entries keep their
    // position, areas that are no longer unassigned get `resolved: true` (shown
    // as a check) instead of being renumbered away. Matching is by geo_id
    // overlap. `reset()` (new document) starts the list over.
    const prevFeatures = get().unassignedFeatureBboxes;
    let merged = newFeatures;
    if (prevFeatures.length) {
      const idToNewIndex = new Map<string, number>();
      newFeatures.forEach((f, i) =>
        f.properties?.geo_ids?.forEach((id: string) => idToNewIndex.set(id, i))
      );
      const matched = new Set<number>();
      merged = prevFeatures.map(f => {
        if (f.properties?.resolved) return f;
        const newIndex = (f.properties?.geo_ids ?? [])
          .map((id: string) => idToNewIndex.get(id))
          .find((i: number | undefined) => i !== undefined && !matched.has(i));
        if (newIndex === undefined) {
          return {...f, properties: {...f.properties, resolved: true}};
        }
        matched.add(newIndex);
        return newFeatures[newIndex];
      });
      newFeatures.forEach((f, i) => {
        if (!matched.has(i)) merged.push(f);
      });
    }

    // Positions are stable, so keep the selection unless its area was resolved.
    const prevSelected = get().selectedIndex;
    const keepSelection =
      prevSelected !== null && merged[prevSelected] && !merged[prevSelected].properties?.resolved;
    set({
      hasFoundUnassigned: true,
      selectedIndex: keepSelection ? prevSelected : null,
      unassignedFeatureBboxes: merged,
    });
  },
}));
