import {MutationObserver} from '@tanstack/query-core';
import {queryClient} from '../queryClient';
import {getSharePlanLink} from '../apiHandlers/getSharePlanLink';
import {useMapStore} from '@/app/store/mapStore';

export const sharePlan = new MutationObserver(queryClient, {
  mutationFn: getSharePlanLink,
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
    const {userMaps, mapDocument, upsertUserMap} = useMapStore.getState();

    upsertUserMap({
      documentId: mapDocument?.document_id,
      // @ts-ignore works but investigate
      mapDocument: {
        ...mapDocument,
        document_id: mapDocument?.document_id || '',
        token: data.token,
        access: data.access,
        status: data.status, // TODO: align fe and be syntax for statuses
      },
    });
    return data.token;
  },
});
