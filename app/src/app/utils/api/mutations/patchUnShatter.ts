import {MutationObserver} from '@tanstack/query-core';
import {queryClient} from '../queryClient';
import {patchUnShatterParents} from '../apiHandlers/patchUnShatterParents';
import {useMapStore} from '@/app/store/mapStore';

export const patchUnShatter = new MutationObserver(queryClient, {
  mutationFn: patchUnShatterParents,
  onMutate: ({document_id, geoids}) => {
    useMapStore.getState().setMapLock(true);
    console.log(
      `Unshattering parents ${geoids} in document ${document_id}...`,
      `Locked at `,
      performance.now()
    );
  },
  onError: error => {
    console.log('Error updating assignments: ', error);
  },
  onSuccess: data => {
    console.log(`Successfully un-shattered parents ${data.geoids.join(', ')} from children`);
    return data;
  },
});
