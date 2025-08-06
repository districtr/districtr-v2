import {MutationObserver} from '@tanstack/query-core';
import {queryClient} from '../queryClient';
import {patchSharePlan} from '../apiHandlers/patchSharePlan';

export const sharePlan = new MutationObserver(queryClient, {
  mutationFn: patchSharePlan,
  onMutate: ({
    document_id,
    password,
    access_type,
  }: {
    document_id: string | undefined;
    password: string | null;
    access_type: string | undefined;
  }) => {
    return {document_id, password, access_type};
  },
  onError: error => {
    console.error('Error getting share plan link: ', error);
  },
  onSuccess: data => {
    console.log('Successfully upserted share plan', data);
    return data;
  },
});
