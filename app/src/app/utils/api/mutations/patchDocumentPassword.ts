import {MutationObserver} from '@tanstack/query-core';
import {queryClient} from '../queryClient';
import {setPlanPassword} from '../apiHandlers/setPlanPassword';

export const patchDocumentPassword = new MutationObserver(queryClient, {
  mutationFn: setPlanPassword,
  onMutate: ({
    document_id,
    password,
  }: {
    document_id: string | undefined;
    password: string | null;
  }) => {
    return {document_id, password};
  },
  onError: error => {
    console.error('Error setting plan password: ', error);
  },
});
