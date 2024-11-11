import {MutationObserver} from '@tanstack/query-core';
import {queryClient} from './queryClient';
import {
  AssignmentsCreate,
  createMapDocument,
  patchShatterParents,
  patchUpdateAssignments,
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
    useMapStore.getState().setAssignmentsHash(performance.now().toString());
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
    useMapStore.getState().setAssignmentsHash(performance.now().toString());
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
    useMapStore.getState().setAssignmentsHash(performance.now().toString());
    useMapStore.getState().setAppLoadingState('loaded');
    const documentUrl = new URL(window.location.toString());
    documentUrl.searchParams.set('document_id', data.document_id);
    history.pushState({}, '', documentUrl.toString());
  },
});
