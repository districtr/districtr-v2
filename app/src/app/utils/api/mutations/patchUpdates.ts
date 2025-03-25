import { MutationObserver } from '@tanstack/query-core';
import { queryClient } from '../queryClient';
import { patchUpdateAssignments, AssignmentsCreate } from '../apiHandlers';
import { useMapStore } from '@/app/store/mapStore';

export const patchUpdates = new MutationObserver(queryClient, {
  mutationFn: patchUpdateAssignments,
  onMutate: () => {
    console.log('Updating assignments');
    const {zoneAssignments, shatterIds, shatterMappings, mapDocument, lastUpdatedHash} =
      useMapStore.getState();
    if (!mapDocument) return;
  },
  onError: error => {
    console.log('Error updating assignments: ', error);
  },
  onSuccess: (data: AssignmentsCreate) => {
    console.log(`Successfully upserted ${data.assignments_upserted} assignments`);
    const {isPainting} = useMapStore.getState();
    // remove trailing shattered features
    // This needs to happen AFTER the updates are done
    const {processHealParentsQueue, mapOptions, parentsToHeal} = useMapStore.getState();
    if (mapOptions.mode === 'default' && parentsToHeal.length) {
      processHealParentsQueue();
    }
  },
});