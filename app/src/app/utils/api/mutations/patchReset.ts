import { MutationObserver } from '@tanstack/query-core';
import { queryClient } from '../queryClient';
import { patchUpdateReset, AssignmentsReset } from '../apiHandlers';

export const patchReset = new MutationObserver(queryClient, {
  mutationFn: patchUpdateReset,
  onMutate: () => {
    console.log('Resetting map');
  },
  onError: error => {
    console.log('Error resetting map: ', error);
  },
  onSuccess: (data: AssignmentsReset) => {
    console.log(`Successfully reset ${data.document_id}`);
  },
});