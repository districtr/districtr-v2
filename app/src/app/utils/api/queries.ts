import {QueryObserver} from '@tanstack/react-query';
import {queryClient} from './queryClient';
import {
  DistrictrMap,
  getAvailableDistrictrMaps,
  DocumentObject,
  getAssignments,
  getDocument,
  RemoteAssignmentsResponse,
} from './apiHandlers';
import {useMapStore} from '@/app/store/mapStore';

const INITIAL_VIEW_LIMIT = 30;
const INITIAL_VIEW_OFFSET = 0;

const mapViewsQuery = new QueryObserver<DistrictrMap[]>(queryClient, {
  queryKey: ['views', INITIAL_VIEW_LIMIT, INITIAL_VIEW_OFFSET],
  queryFn: () => getAvailableDistrictrMaps(INITIAL_VIEW_LIMIT, INITIAL_VIEW_OFFSET),
});

const updateMapViews = (limit: number, offset: number) => {
  mapViewsQuery.setOptions({
    queryKey: ['views', limit, offset],
    queryFn: () => getAvailableDistrictrMaps(limit, offset),
  });
};

const getQueriesResultsSubs = (_useMapStore: typeof useMapStore) => {
  mapViewsQuery.subscribe(result => {
    if (result) {
      _useMapStore.getState().setMapViews(result);
    }
  });
};

const getDocumentFunction = (documentId?: string) => {
  return async () => {
    const currentId = useMapStore.getState().mapDocument?.document_id;
    if (documentId && documentId !== currentId) {
      useMapStore.getState().setAppLoadingState('loading');
      return await getDocument(documentId);
    } else {
      return null;
    }
  };
};

const updateDocumentFromId = new QueryObserver<DocumentObject | null>(queryClient, {
  queryKey: ['mapDocument', undefined],
  queryFn: getDocumentFunction(),
});

updateDocumentFromId.subscribe(mapDocument => {
  if (typeof window === 'undefined') return;

  const documentId = new URLSearchParams(window.location.search).get('document_id');
  if (mapDocument.error && documentId?.length) {
    useMapStore.getState().setErrorNotification({
      severity: 2,
      id: 'map-document-not-found',
      message: `The requested map id "${documentId}" could not be found. Please make sure the URL is correct or select a different geography.`,
    });
    // remove current document_id on search params
    const url = new URL(window.location.href);
    url.searchParams.delete('document_id');
    window.history.replaceState({}, document.title, url.toString());
  }
  if (mapDocument.data && mapDocument.data.document_id !== useMapStore.getState().loadedMapId) {
    useMapStore.getState().setMapDocument(mapDocument.data);
  }
});

const updateGetDocumentFromId = (documentId: string) => {
  updateDocumentFromId.setOptions({
    queryKey: ['mapDocument', documentId],
    queryFn: getDocumentFunction(documentId),
  });
};

export const fetchAssignments = new QueryObserver<null | RemoteAssignmentsResponse>(queryClient, {
  queryKey: ['assignments'],
  queryFn: () => getAssignments(useMapStore.getState().mapDocument),
});

const updateAssignments = (mapDocument: DocumentObject) => {
  fetchAssignments.setOptions({
    queryFn: () => getAssignments(mapDocument),
    queryKey: ['assignments', performance.now()],
  });
};

fetchAssignments.subscribe(assignments => {
  if (assignments.data) {
    const {loadZoneAssignments, loadedMapId, setAppLoadingState} = useMapStore.getState();
    if (assignments.data.documentId === loadedMapId) {
      console.log(
        'Map already loaded, skipping assignment load',
        assignments.data.documentId,
        loadedMapId
      );
    } else {
      loadZoneAssignments(assignments.data);
      useMapStore.temporal.getState().clear();
    }
    setAppLoadingState('loaded');
  }
});

export {
  updateMapViews,
  getQueriesResultsSubs,
  mapViewsQuery,
  updateGetDocumentFromId,
  updateAssignments,
  updateDocumentFromId
};
