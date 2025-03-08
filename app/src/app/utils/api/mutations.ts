import {MutationObserver} from '@tanstack/query-core';
import {queryClient} from './queryClient';
import {
  AssignmentsCreate,
  AssignmentsReset,
  createMapDocument,
  patchShatterParents,
  patchUnShatterParents,
  patchUpdateAssignments,
  patchUpdateReset,
  saveMapDocumentMetadata,
  populationAbortController,
  getSharePlanLink,
  getLoadPlanFromShare,
  getAssignments,
} from '@/app/utils/api/apiHandlers';
import {useMapStore} from '@/app/store/mapStore';
import {mapMetrics} from './queries';
import {useChartStore} from '@/app/store/chartStore';
import type {AxiosError} from 'axios';

export interface AxiosErrorData {
  detail: 'Invalid password' | 'Password required';
}

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

export const patchUpdates = new MutationObserver(queryClient, {
  mutationFn: patchUpdateAssignments,
  onMutate: () => {
    populationAbortController?.abort();

    const {zoneAssignments, shatterIds, shatterMappings, mapDocument, lastUpdatedHash} =
      useMapStore.getState();
    if (!mapDocument) return;
  },
  onError: error => {
    console.log('Error updating assignments: ', error);
  },
  onSuccess: (data: AssignmentsCreate) => {
    console.log(`Successfully upserted ${data.assignments_upserted} assignments`);
    const {isPainting} = useMapStore.getState();
    const {mapMetrics: _mapMetrics} = useChartStore.getState();
    if (!isPainting || !_mapMetrics?.data) {
      mapMetrics.refetch();
    }
    // remove trailing shattered features
    // This needs to happen AFTER the updates are done
    const {processHealParentsQueue, mapOptions, parentsToHeal} = useMapStore.getState();
    if (mapOptions.mode === 'default' && parentsToHeal.length) {
      processHealParentsQueue();
    }
  },
});

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
    mapMetrics.refetch();
  },
});

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
    setLoadedMapId(data.document_id);
    setAssignmentsHash(Date.now().toString());
    setAppLoadingState('loaded');
    const documentUrl = new URL(window.location.toString());
    documentUrl.searchParams.set('document_id', data.document_id);
    history.pushState({}, '', documentUrl.toString());
  },
});

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
        status: data.access === 'edit' ? 'unlocked' : 'locked', // TODO: align fe and be syntax for statuses
      },
    });
    return data.token;
  },
});

export const sharedDocument = new MutationObserver(queryClient, {
  mutationFn: getLoadPlanFromShare,
  onMutate: ({
    token,
    password,
    status,
  }: {
    token: string;
    password: string | null;
    status: string | null;
  }) => {
    const passwordRequired = useMapStore.getState().passwordPrompt;
    useMapStore.getState().setAppLoadingState('loading');
  },
  onError: error => {
    const errorData = (error as AxiosError)?.response?.data as AxiosErrorData;
    if (errorData.detail === 'Invalid password') {
      useMapStore.getState().setShareMapMessage('Error: Incorrect password. Please try again');
    } else if (errorData.detail === 'Password required') {
      useMapStore
        .getState()
        .setShareMapMessage(
          'This document requires a password to view. Please enter a valid password'
        );
    }
  },
  onSuccess: data => {
    const {setMapDocument, setLoadedMapId, setAppLoadingState, setPasswordPrompt} =
      useMapStore.getState();
    useMapStore.getState().setLoadedMapId('');
    data.status = 'locked';
    getAssignments(data);
    setMapDocument(data);
    setLoadedMapId(data.document_id);
    setAppLoadingState('loaded');
    setPasswordPrompt(false);
    const documentUrl = new URL(window.location.toString());
    documentUrl.searchParams.delete('share'); // remove share + token from url
    documentUrl.searchParams.set('document_id', data.document_id);
    history.pushState({}, '', documentUrl.toString());
  },
});
