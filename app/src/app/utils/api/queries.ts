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
  getP1TotPopSummaryStats,
  P1TotPopSummaryStats,
} from './apiHandlers';
import {MapStore, useMapStore} from '@/app/store/mapStore';

const INITIAL_VIEW_LIMIT = 30;
const INITIAL_VIEW_OFFSET = 0;

/**
 * A utility function that returns a query function based on a nullable parameter.
 * 
 * @param callback - A function that takes a parameter of type ParamT and returns a Promise of type ResultT.
 * @param nullableParam - An optional parameter of type ParamT. If this parameter is not provided or is falsy, the function will return a function that returns null.
 * 
 * @returns A function that, when called, will either return null (if nullableParam is not provided) 
 *          or call the callback function with the nullableParam and return its result.
 * 
 * @template ParamT - The type of the parameter that the callback function accepts.
 * @template ResultT - The type of the result that the callback function returns.
 */
const getNullableParamQuery = <ParamT, ResultT>(callback: (param: ParamT) => Promise<ResultT>, nullableParam?: ParamT) => {
  if (!nullableParam) return () => null;
  return async () => await callback(nullableParam);
};

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
  useMapStore.getState().setMapMetrics(result);
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
    if (response?.data?.results?.length) {
      useMapStore.getState().setSummaryStat('totpop', { data: response.data.results[0]});
    } else {
      useMapStore.getState().setSummaryStat('totpop', undefined)
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
  if (mapDocument.data) {
    useMapStore.getState().setMapDocument(mapDocument.data);
  }
});

export const fetchAssignments = new QueryObserver<null | Assignment[]>(queryClient, {
  queryKey: ['assignments'],
  queryFn: getNullableParamQuery<MapStore['mapDocument'], Assignment[]>(getAssignments) 
});

export const updateAssignments = (mapDocument: DocumentObject) => {
  fetchAssignments.setOptions({
    queryFn: getNullableParamQuery(getAssignments, mapDocument),
    queryKey: ['assignments', performance.now()],
  });
};

fetchAssignments.subscribe(assignments => {
  if (assignments.data) {
    useMapStore.getState().loadZoneAssignments(assignments.data);
  }
});

export const fetchTotPop = new QueryObserver<SummaryStatsResult<P1TotPopSummaryStats[]> | null>(queryClient, {
  queryKey: ['gerrydb_tot_pop'],
  queryFn: getNullableParamQuery<MapStore['mapDocument'], SummaryStatsResult<P1TotPopSummaryStats[]>>(getP1TotPopSummaryStats),
});

export const updateTotPop = (mapDocument: DocumentObject | null) => {
  fetchTotPop.setOptions({
    queryFn: getNullableParamQuery(getP1TotPopSummaryStats, mapDocument),
    queryKey: ['gerrydb_tot_pop', mapDocument?.gerrydb_table],
  });
};

