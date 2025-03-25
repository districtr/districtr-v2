import { MutationObserver } from '@tanstack/query-core';
import { queryClient } from '../queryClient';
import { saveMapDocumentMetadata } from '../apiHandlers/saveMapDocumentMetadata';

export const metadata = new MutationObserver(queryClient, {
  mutationFn: saveMapDocumentMetadata,
  onMutate: ({document_id, metadata}) => {
    return {document_id, metadata};
  },
  onError: error => {
    console.error('Error saving map metadata: ', error);
  },
  onSuccess: data => {
    console.log('Successfully saved metadata');
  },
});