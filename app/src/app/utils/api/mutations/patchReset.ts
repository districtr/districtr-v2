import { MutationObserver } from '@tanstack/query-core';
import { queryClient } from '../queryClient';
import { patchUpdateReset} from '../apiHandlers/patchUpdateReset';
import { AssignmentsReset } from '@utils/api/apiHandlers/types';

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