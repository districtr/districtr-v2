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
    return data;
  },
});
