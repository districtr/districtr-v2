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
  RemoteAssignmentsResponse,
  getDistrictrMapPopSummaryStats,
} from './apiHandlers';
import {useMapStore} from '@/app/store/mapStore';
import {useChartStore} from '@/app/store/chartStore';
import {updateChartData} from '../helpers';
import {
  P1TotPopSummaryStats,
  P4VapPopSummaryStats,
  SummaryStatsResult,
} from './summaryStats';

const INITIAL_VIEW_LIMIT = 30;
const INITIAL_VIEW_OFFSET = 0;

const mapMetrics = new QueryObserver<{data: ZonePopulation[]; hash: string}>(queryClient, {
  queryKey: ['_zonePopulations'],
  queryFn: skipToken,
});

const updateMapMetrics = (mapDocument: DocumentObject) => {
  mapMetrics.setOptions({
    queryKey: ['zonePopulations', mapDocument.document_id],
    queryFn: mapDocument ? () => getZonePopulations(mapDocument) : skipToken,
  });
};

mapMetrics.subscribe(result => {
  // don't load the result if:
  // no data
  // if the query is currently fetching
  // hash is stale, but not the initial hash
  if (
    result?.data?.data &&
    !result.isFetching &&
    (useMapStore.getState().lastUpdatedHash === result.data?.hash || result?.data.hash == '')
  ) {
    useChartStore.getState().setMapMetrics({
      ...result,
      // @ts-ignore data is not undefined
      data: result.data.data,
    });
  }
});

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
  fetchTotPop.subscribe(response => {
    if (response?.data?.length) {
      const {setSummaryStat, mapDocument} = _useMapStore.getState();
      mapDocument?.available_summary_stats.forEach((stat, i) => {
        const data = response.data?.[i].results;
        if (data) {
          setSummaryStat(stat, data);
          if (stat === 'P1') {
            const p1Data = data as P1TotPopSummaryStats;
            setSummaryStat('idealpop', p1Data.total_pop / (mapDocument?.num_districts ?? 4));
            const mapMetrics = useChartStore.getState().mapMetrics;
            if (mapMetrics && mapDocument?.num_districts && p1Data.total_pop) {
              updateChartData(mapMetrics, mapDocument.num_districts, p1Data.total_pop);
            }
          }
        } else {
          setSummaryStat(stat, undefined);
        }
      });
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
      fetchTotPop.refetch();
      useMapStore.temporal.getState().clear();
    }
    setAppLoadingState('loaded');
  }
});

const fetchTotPop = new QueryObserver<Array<
  SummaryStatsResult<P1TotPopSummaryStats | P4VapPopSummaryStats>
> | null>(queryClient, {
  queryKey: ['gerrydb_tot_pop'],
  queryFn: () => {
    const mapDocument = useMapStore.getState().mapDocument;
    if (!mapDocument) {
      return null;
    }
    return Promise.all(
      mapDocument?.available_summary_stats?.map(stat =>
        getDistrictrMapPopSummaryStats(mapDocument, stat)
      )
    );
  },
});

const updateTotPop = (mapDocument: DocumentObject | null) => {
  const hasStats = mapDocument?.available_summary_stats?.length;
  if (!hasStats) {
    useMapStore.getState().setErrorNotification({
      severity: 2,
      id: 'missing-tot-pop',
      message: `The requested map does not have a population table available. Population stats may not display`,
    });
  }

  const innerFn = () => {
    const mapDocument = useMapStore.getState().mapDocument;
    if (!mapDocument) {
      return null;
    }
    return Promise.all(
      mapDocument?.available_summary_stats?.map(stat =>
        getDistrictrMapPopSummaryStats(mapDocument, stat)
      )
    );
  };
  fetchTotPop.setOptions({
    queryFn: innerFn,
    queryKey: ['gerrydb_tot_pop', mapDocument?.gerrydb_table],
  });
};

export {
  updateMapMetrics,
  updateMapViews,
  getQueriesResultsSubs,
  updateTotPop,
  fetchTotPop,
  mapMetrics,
  mapViewsQuery,
  updateGetDocumentFromId,
  updateAssignments,
  updateDocumentFromId
};
