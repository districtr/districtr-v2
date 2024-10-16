import { QueryObserver, skipToken } from "@tanstack/react-query";
import { queryClient } from "./queryClient";
import {
  DistrictrMap,
  DocumentObject,
  getAvailableDistrictrMaps,
  getDocument,
  getZonePopulations,
  ZonePopulation,
} from "./apiHandlers";
import { useMapStore } from "@/app/store/mapStore";

const INITIAL_VIEW_LIMIT = 30
const INITIAL_VIEW_OFFSET = 0

export const mapMetrics = new QueryObserver<ZonePopulation[]>(queryClient, {
  queryKey: ["_zonePopulations"],
  queryFn: skipToken,
});

export const updateMapMetrics = (mapDocument: DocumentObject) => {
  mapMetrics.setOptions({
    queryKey: ["zonePopulations", mapDocument.document_id],
    queryFn: mapDocument ? () => getZonePopulations(mapDocument) : skipToken,
  });
};


mapMetrics.subscribe((result) => {
  useMapStore.getState().setMapMetrics(result);
});

export const mapViewsQuery = new QueryObserver<DistrictrMap[]>(queryClient, {
  queryKey: ["views", INITIAL_VIEW_LIMIT, INITIAL_VIEW_OFFSET],
  queryFn: () => getAvailableDistrictrMaps(INITIAL_VIEW_LIMIT, INITIAL_VIEW_OFFSET),
});

export const updateMapViews = (limit: number, offset: number) => {
  mapViewsQuery.setOptions({
    queryKey: ["views", limit, offset],
    queryFn: () => getAvailableDistrictrMaps(limit, offset),
  });
};

export const getMapViewsSubs = (_useMapStore: typeof useMapStore) => {
  mapViewsQuery.subscribe((result) => {
    if (result) {
      _useMapStore.getState().setMapViews(result)
    }
  })
}

const getDocumentFunction = (documentId?: string) => {
  return async () => {
    const currentId = useMapStore.getState().mapDocument?.document_id;
    if (documentId && documentId !== currentId) {
      useMapStore.getState().setAppLoadingState('loading');
      return await getDocument(documentId);
    } else {
      return null;
    }
}
}

export const updateDocumentFromId = new QueryObserver<DocumentObject | null>(
  queryClient,
  {
    queryKey: ["mapDocument", undefined],
    queryFn: getDocumentFunction()
  },
);

export const updateGetDocumentFromId = (documentId:string) => {
  updateDocumentFromId.setOptions({
    queryKey: ["mapDocument", documentId],
    queryFn: getDocumentFunction(documentId)
  });
}

updateDocumentFromId.subscribe((mapDocument) => {
  if (mapDocument.data) {
    useMapStore.getState().setMapDocument(mapDocument.data);
  }
});

