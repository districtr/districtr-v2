import {QueryObserver, skipToken} from '@tanstack/react-query';
import {queryClient} from './queryClient';
import {
  DistrictrMap,
  getAvailableDistrictrMaps,
  Assignment,
  DocumentObject,
  getAssignments,
  getDocument,
  getZonePopulations,
  ZonePopulation,
  SummaryStatsResult,
  getTotPopSummaryStats,
  P1TotPopSummaryStats,
  P4TotPopSummaryStats,
} from './apiHandlers';
import {getEntryTotal} from '@/app/utils/summaryStats';
import {useMapStore} from '@/app/store/mapStore';
import {useChartStore} from '@/app/store/chartStore';

const INITIAL_VIEW_LIMIT = 30;
const INITIAL_VIEW_OFFSET = 0;

export const mapMetrics = new QueryObserver<ZonePopulation[]>(queryClient, {
  queryKey: ['_zonePopulations'],
  queryFn: skipToken,
});

export const updateMapMetrics = (mapDocument: DocumentObject) => {
  mapMetrics.setOptions({
    queryKey: ['zonePopulations', mapDocument.document_id],
    queryFn: mapDocument ? () => getZonePopulations(mapDocument) : skipToken,
  });
};

mapMetrics.subscribe(result => {
  useChartStore.getState().setMapMetrics(result);
});

export const mapViewsQuery = new QueryObserver<DistrictrMap[]>(queryClient, {
  queryKey: ['views', INITIAL_VIEW_LIMIT, INITIAL_VIEW_OFFSET],
  queryFn: () => getAvailableDistrictrMaps(INITIAL_VIEW_LIMIT, INITIAL_VIEW_OFFSET),
});

export const updateMapViews = (limit: number, offset: number) => {
  mapViewsQuery.setOptions({
    queryKey: ['views', limit, offset],
    queryFn: () => getAvailableDistrictrMaps(limit, offset),
  });
};

export const getQueriesResultsSubs = (_useMapStore: typeof useMapStore) => {
  mapViewsQuery.subscribe(result => {
    if (result) {
      _useMapStore.getState().setMapViews(result);
    }
  });
  fetchTotPop.subscribe(response => {
    if (response?.data?.results) {
      // console.log(response?.data?.results);
      useMapStore.getState().setSummaryStat('totpop', {data: response.data.results});
      useMapStore.getState().setSummaryStat('idealpop', {
        data:
          getEntryTotal(response.data.results) /
          (useMapStore.getState().mapDocument?.num_districts ?? 1),
      });
    } else {
      useMapStore.getState().setSummaryStat('totpop', undefined);
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

export const updateDocumentFromId = new QueryObserver<DocumentObject | null>(queryClient, {
  queryKey: ['mapDocument', undefined],
  queryFn: getDocumentFunction(),
});

export const updateGetDocumentFromId = (documentId: string) => {
  updateDocumentFromId.setOptions({
    queryKey: ['mapDocument', documentId],
    queryFn: getDocumentFunction(documentId),
  });
};

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
  if (mapDocument.data) {
    useMapStore.getState().setMapDocument(mapDocument.data);
  }
});

export const fetchAssignments = new QueryObserver<null | Assignment[]>(queryClient, {
  queryKey: ['assignments'],
  queryFn: () => getAssignments(useMapStore.getState().mapDocument),
});

export const updateAssignments = (mapDocument: DocumentObject) => {
  fetchAssignments.setOptions({
    queryFn: () => getAssignments(mapDocument),
    queryKey: ['assignments', performance.now()],
  });
};

fetchAssignments.subscribe(assignments => {
  if (assignments.data) {
    useMapStore.getState().loadZoneAssignments(assignments.data);
  }
});

export const fetchTotPop = new QueryObserver<SummaryStatsResult<
  P1TotPopSummaryStats | P4TotPopSummaryStats
> | null>(queryClient, {
  queryKey: ['gerrydb_tot_pop'],
  queryFn: () =>
    getTotPopSummaryStats(
      useMapStore.getState().mapDocument,
      useMapStore.getState().mapDocument?.available_summary_stats?.[0]
    ),
});

export const updateTotPop = (mapDocument: DocumentObject | null) => {
  fetchTotPop.setOptions({
    queryFn: () => getTotPopSummaryStats(mapDocument, mapDocument?.available_summary_stats?.[0]),
    queryKey: ['gerrydb_tot_pop', mapDocument?.gerrydb_table],
  });
};

// getNullableParamQuery(, mapDocument, mapDocument?.available_summary_stats?.[0]),
