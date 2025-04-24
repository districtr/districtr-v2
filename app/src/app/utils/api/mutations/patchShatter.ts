import {MutationObserver} from '@tanstack/query-core';
import {queryClient} from '../queryClient';
import {patchShatterParents} from '../apiHandlers/patchShatterParents';
import {useMapStore} from '@/app/store/mapStore';

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
    return data;
  },
});
