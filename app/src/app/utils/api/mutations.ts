import {MutationObserver} from '@tanstack/query-core';
import {queryClient} from './queryClient';
import {
  AssignmentsCreate,
  AssignmentsReset,
  createMapDocument,
  currentHash,
  patchShatterParents,
  patchUnShatterParents,
  patchUpdateAssignments,
  patchUpdateReset,
  saveMapDocumentMetadata,
  populationAbortController,
  getSharePlanLink,
  getLoadPlanFromShare,
} from '@/app/utils/api/apiHandlers';
import {useMapStore} from '@/app/store/mapStore';
import {mapMetrics} from './queries';
import {useChartStore} from '@/app/store/chartStore';
import {districtrIdbCache} from '../cache';
import {useMutation} from '@tanstack/react-query';
import {use} from 'react';

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
    console.log('Updating assignments');
    populationAbortController?.abort();

    const {zoneAssignments, shatterIds, shatterMappings, mapDocument, lastUpdatedHash} =
      useMapStore.getState();
    if (!mapDocument) return;
    districtrIdbCache.cacheAssignments(mapDocument.document_id, lastUpdatedHash, {
      zoneAssignments,
      shatterIds,
      shatterMappings,
    });
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
    console.log('Reseting map');
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
    console.log('Creating document');
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
    const plan = userMaps.find(map => map.document_id === mapDocument?.document_id);
    console.log('Successfully created share link: ', data.token);
    console.log(plan);
    // upsert the user map with the new share token
    if (!plan && mapDocument?.document_id) {
      // should add to usermaps if not found
      upsertUserMap({
        documentId: mapDocument?.document_id,
        mapDocument: {
          ...mapDocument,
          token: data.token,
        },
      });
    }
    return data.token;
  },
});

export const sharedDocument = new MutationObserver(queryClient, {
  mutationFn: getLoadPlanFromShare,
  onMutate: ({token, password}: {token: string; password: string | null}) => {
    const passwordRequired = useMapStore.getState().passwordPrompt;
    useMapStore.getState().setAppLoadingState('loading');
    console.log('loading from share');
  },
  onError: error => {
    console.error('Error fetching shared document: ', error);
    useMapStore
      .getState()
      .setShareMapMessage('Error fetching shared document. Please enter a valid password');
  },
  onSuccess: data => {
    const {
      setMapDocument,
      setLoadedMapId,
      setAssignmentsHash,
      setAppLoadingState,
      setPasswordPrompt,
    } = useMapStore.getState();
    setMapDocument(data);
    setLoadedMapId(data.document_id);
    setAssignmentsHash(Date.now().toString());
    setAppLoadingState('loaded');
    setPasswordPrompt(false);
    const documentUrl = new URL(window.location.toString());
    documentUrl.searchParams.delete('share'); // remove share + token from url
    documentUrl.searchParams.set('document_id', data.document_id);
    history.pushState({}, '', documentUrl.toString());
  },
});
