import { QueryObserver, skipToken } from "@tanstack/react-query";
import { queryClient } from "./queryClient";
import {
  Assignment,
  DocumentObject,
  getAssignments,
  getDocument,
  getZonePopulations,
  ZonePopulation,
} from "./apiHandlers";
import { MapStore, useMapStore } from "@/app/store/mapStore";

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

export const updateDocumentFromId = new QueryObserver<DocumentObject | null>(
  queryClient,
  {
    queryKey: ["mapDocument"],
    queryFn: async () => {
      const document_id = new URL(window.location.href).searchParams.get(
        "document_id"
      );
      const mapDocument = useMapStore.getState().mapDocument;
      if (document_id && mapDocument?.document_id !== document_id) {
        useMapStore.getState().setAppLoadingState('loading');
        return await getDocument(document_id);
      } else {
        return null;
      }
    },
  }
);

updateDocumentFromId.subscribe((mapDocument) => {
  if (mapDocument.data) {
    useMapStore.getState().setMapDocument(mapDocument.data);
  }
});

const getFetchAssignmentsQuery = (mapDocument?: MapStore['mapDocument']) => {
  if (!mapDocument) return () => null     
  return async () => await getAssignments(mapDocument)
}

export const fetchAssignments = new QueryObserver<null | Assignment[]>(
  queryClient,
  {
    queryKey: ["assignments"],
    queryFn: getFetchAssignmentsQuery(),
  }
)

export const updateAssignments = (mapDocument: DocumentObject) => {
  fetchAssignments.setOptions({
    queryFn: getFetchAssignmentsQuery(mapDocument),
    queryKey: ['assignments', performance.now()]
  })
}


fetchAssignments.subscribe((assignments) => {
  if (assignments.data) {
    useMapStore.getState().loadZoneAssignments(assignments.data);
  }
});