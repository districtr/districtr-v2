import {useMapStore} from '@/app/store/mapStore';
import {useEffect, useRef} from 'react';
import {useVisibilityState} from './useVisibilityState';
import {useRouter} from 'next/navigation';
import { useMapControlsStore } from '../store/mapControlsStore';
import { useAssignmentsStore } from '../store/assignmentsStore';

interface UseMapBrowserEventsV2Props {
  mapId: string;
  isEditing: boolean;
}

export const useMapBrowserEvents = ({isEditing, mapId}: UseMapBrowserEventsV2Props) => {
  // VISIBILITY BEHAVIOR
  const {isVisible} = useVisibilityState();
  const unloadTimepoutRef = useRef<NodeJS.Timeout | null>(null);
  const setAppLoadingState = useMapStore(state => state.setAppLoadingState);
  const setIsEditing = useMapControlsStore(state => state.setIsEditing);
  const setZoneAssignments = useAssignmentsStore(state => state.setZoneAssignments);
  const mapDocument = useMapStore(state => state.mapDocument);
  const setMapDocument = useMapStore(state => state.setMapDocument);
  const setErrorNotification = useMapStore(state => state.setErrorNotification);
  const router = useRouter();

  // const {
  //   data: mapDocumentData,
  //   refetch: refetchMapDocument,
  //   isLoading: isLoadingDocument,
  //   isFetching: isFetchingDocument,
  //   error: mapDocumentError,
  // } = useQuery({
  //   queryKey: ['mapDocument', mapId],
  //   queryFn: () => getDocument(mapId),
  //   staleTime: 0,
  //   placeholderData: _ => null,
  //   refetchOnWindowFocus: false,
  // });

  // const {
  //   data: assignmentsData,
  //   refetch: refetchAssignments,
  //   isLoading: isLoadingAssignments,
  //   isFetching: isFetchingAssignments,
  //   error: assignmentsError,
  // } = useQuery({
  //   queryKey: ['assignments', mapDocumentData?.document_id],
  //   queryFn: () => getAssignments(mapDocumentData),
  //   staleTime: 0,
  //   placeholderData: _ => null,
  //   refetchOnWindowFocus: false,
  // });

  // useEffect(() => {
  //   if (
  //     mapDocumentData &&
  //     (mapDocumentData.document_id === mapId || `${mapDocumentData?.public_id}` === mapId)
  //   ) {
  //     const prevIsSameId = mapDocument?.document_id === mapDocumentData?.document_id;
  //     const remoteHasUpdated =
  //       mapDocumentData?.updated_at &&
  //       mapDocument?.updated_at &&
  //       new Date(mapDocumentData.updated_at) > new Date(mapDocument.updated_at);
  //     if (!prevIsSameId || remoteHasUpdated) {
  //       setMapDocument(mapDocumentData);
  //     }
  //     if (prevIsSameId && remoteHasUpdated) {
  //       refetchAssignments();
  //     }
  //   }
  // }, [mapDocumentData, setMapDocument]);

  // useEffect(() => {
  //   if (assignmentsData) {
  //     loadZoneAssignments(assignmentsData);
  //   }
  // }, [assignmentsData, loadZoneAssignments]);

  // useEffect(() => {
  //   let errorText = '';
  //   // let errorText = `We couldn't find the map you're looking for with the ID ${mapId}.`;
  //   if (mapDocumentError && assignmentsError) {
  //     errorText = `We couldn't find a plan with ID "${mapId}" and the district assignments associated with it.`;
  //   } else if (mapDocumentError) {
  //     errorText = `We couldn't find a plan with ID "${mapId}".`;
  //   } else if (assignmentsError) {
  //     errorText = `We couldn't find the district assignments for the plan with ID "${mapId}".`;
  //   }
  //   if (errorText && mapId?.length) {
  //     errorText += `\n Please make sure you have the right map ID and try reloading the page. If the problem persists, please contact Districtr support with the error ID below. You will be redirected in 10 seconds.`;
  //     setErrorNotification({
  //       message: errorText,
  //       id: `map-not-found-${mapId}`,
  //       severity: 1,
  //     });
  //     setTimeout(() => {
  //       router.push('/map');
  //       setErrorNotification({});
  //     }, 10000);
  //   }
  // }, [mapDocumentError, assignmentsError, setErrorNotification]);

  // SET EDITING MODE
  useEffect(() => {
    setIsEditing(isEditing);
  }, [isEditing, setIsEditing]);

  return {};
};
