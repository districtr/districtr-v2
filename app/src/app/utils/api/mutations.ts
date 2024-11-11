import {MutationObserver} from '@tanstack/query-core';
import {queryClient} from './queryClient';
import {
  AssignmentsCreate,
  AssignmentsReset,
  createMapDocument,
  patchShatterParents,
  patchUnShatterParents,
  patchUpdateAssignments,
  patchUpdateReset,
} from '@/app/utils/api/apiHandlers';
import {useMapStore} from '@/app/store/mapStore';
import {mapMetrics} from './queries';

export const patchShatter = new MutationObserver(queryClient, {
  mutationFn: patchShatterParents,
  onMutate: ({document_id, geoids}) => {
    useMapStore.getState().setMapLock(true);
    console.log(
      `Shattering parents for ${geoids} in document ${document_id}...`,
      `Locked at `,
      performance.now()
    );
  },
  onError: error => {
    console.log('Error updating assignments: ', error);
  },
  onSuccess: data => {
    console.log(`Successfully shattered parents into ${data.children.length} children`);
    return data;
  },
});

export const patchUnShatter = new MutationObserver(queryClient, {
  mutationFn: patchUnShatterParents,
  onMutate: ({document_id, geoids}) => {
    useMapStore.getState().setMapLock(true);
    console.log(
      `Unshattering parents ${geoids} in document ${document_id}...`,
      `Locked at `,
      performance.now()
    );
  },
  onError: error => {
    console.log('Error updating assignments: ', error);
  },
  onSuccess: data => {
    console.log(`Successfully un-shattered parents ${data.geoids.join(', ')} from children`);
    return data;
  },
});

export const patchUpdates = new MutationObserver(queryClient, {
  mutationFn: patchUpdateAssignments,
  onMutate: () => {
    console.log('Updating assignments');
  },
  onError: error => {
    console.log('Error updating assignments: ', error);
  },
  onSuccess: (data: AssignmentsCreate) => {
    console.log(`Successfully upserted ${data.assignments_upserted} assignments`);
    mapMetrics.refetch();
    // remove trailing shattered features
    // This needs to happen AFTER the updates are done
    const {processHealParentsQueue, mapOptions, parentsToHeal} = useMapStore.getState();
    if (mapOptions.mode === 'default' && parentsToHeal.length) {
      processHealParentsQueue();
    }
  },
});

export const patchReset = new MutationObserver(queryClient, {
  mutationFn: patchUpdateReset,
  onMutate: () => {
    console.log('Reseting map');
  },
  onError: error => {
    console.log('Error reseting map: ', error);
  },
  onSuccess: (data: AssignmentsReset) => {
    console.log(`Successfully reset ${data.document_id}`);
    mapMetrics.refetch();
  },
});

export const document = new MutationObserver(queryClient, {
  mutationFn: createMapDocument,
  onMutate: () => {
    console.log('Creating document');
    useMapStore.getState().setAppLoadingState('loading');
    useMapStore.getState().resetZoneAssignments();
  },
  onError: error => {
    console.error('Error creating map document: ', error);
  },
  onSuccess: data => {
    useMapStore.getState().setMapDocument(data);
    useMapStore.getState().setAppLoadingState('loaded');
    const documentUrl = new URL(window.location.toString());
    documentUrl.searchParams.set('document_id', data.document_id);
    history.pushState({}, '', documentUrl.toString());
  },
});
