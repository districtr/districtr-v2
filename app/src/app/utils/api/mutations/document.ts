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
    // Navigate to edit mode after creating document
    window.location.href = `/map/edit/${data.document_id}`;
  },
});
