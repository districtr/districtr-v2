import {MutationObserver} from '@tanstack/query-core';
import {queryClient} from '../queryClient';
import {createMapDocument} from '../apiHandlers/createMapDocument';
import {useMapStore} from '@/app/store/mapStore';

export const document = new MutationObserver(queryClient, {
  mutationFn: createMapDocument,
  onMutate: () => {
    useMapStore.getState().setAppLoadingState('loading');
    useMapStore.getState().resetZoneAssignments();
  },
  onError: error => {
    console.error('Error creating map document: ', error);
  },
  onSuccess: data => {
    const {setMapDocument, setAssignmentsHash, setAppLoadingState} = useMapStore.getState();
    setMapDocument(data);
    setAssignmentsHash(Date.now().toString());
    setAppLoadingState('loaded');
    const documentUrl = new URL(window.location.toString());
    documentUrl.searchParams.set('document_id', data.document_id);
    // if searchParams has share, remove it
    documentUrl.searchParams.delete('share');
    history.pushState({}, '', documentUrl.toString());
  },
});
