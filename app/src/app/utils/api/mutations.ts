import {MutationObserver} from '@tanstack/query-core';
import {queryClient} from './queryClient';
import {
  AssignmentsCreate,
  AssignmentsReset,
  createMapDocument,
  currentHash,
  patchShatterParents,
  patchUnShatterParents,
  patchUpdateAssignments,
  patchUpdateReset,
  saveMapDocumentMetadata,
  populationAbortController,
  updateAbortController,
} from '@/app/utils/api/apiHandlers';
import {useMapStore} from '@/app/store/mapStore';
import {mapMetrics} from './queries';
import {useChartStore} from '@/app/store/chartStore';

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
    useMapStore.getState().setAssignmentsHash(Date.now().toString());
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
    populationAbortController?.abort();
    updateAbortController?.abort();
  },
  onError: error => {
    console.log('Error updating assignments: ', error);
  },
  onSuccess: (data: AssignmentsCreate) => {
    console.log(`Successfully upserted ${data.assignments_upserted} assignments`);
    const {isPainting} = useMapStore.getState();
    const {mapMetrics: _mapMetrics} = useChartStore.getState();
    if (!isPainting || !_mapMetrics?.data) {
      mapMetrics.refetch();
    }
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
    console.log('Error resetting map: ', error);
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
    const {setMapDocument, setLoadedMapId, setAssignmentsHash, setAppLoadingState} = useMapStore.getState();
    setMapDocument(data);
    setLoadedMapId(data.document_id);
    setAssignmentsHash(Date.now().toString());
    setAppLoadingState('loaded');
    const documentUrl = new URL(window.location.toString());
    documentUrl.searchParams.set('document_id', data.document_id);
    history.pushState({}, '', documentUrl.toString());
  },
});

export const metadata = new MutationObserver(queryClient, {
  mutationFn: saveMapDocumentMetadata,
  //
  onMutate: ({document_id, metadata}) => {
    console.log('Saving metadata');
    return {document_id, metadata};
  },
  onError: error => {
    console.error('Error saving map metadata: ', error);
  },
  onSuccess: data => {
    console.log('Successfully saved metadata');
  },
});
