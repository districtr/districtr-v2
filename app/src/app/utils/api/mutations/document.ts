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
    const {setMapDocument, setLoadedMapId, setAssignmentsHash, setAppLoadingState} =
      useMapStore.getState();
    setMapDocument(data);
    if (data.genesis === 'created') {
      setLoadedMapId(data.document_id);
    }
    setAssignmentsHash(Date.now().toString());
    setAppLoadingState('loaded');

    const documentUrl = new URL(window.location.origin);
    documentUrl.pathname = documentUrl.pathname.split('/').slice(0, -1).join('/') + '/map' + `/${data.serial_id}`;
    history.pushState({}, '', documentUrl.toString());
  },
});
