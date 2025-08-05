import {useMapStore} from '@/app/store/mapStore';
import {unlockMapDocument} from '@utils/api/apiHandlers/unlockMapDocument';
import {useCallback, useEffect, useRef} from 'react';
import {useVisibilityState} from './useVisibilityState';
import {FE_UNLOCK_DELAY} from '../utils/api/constants';
import {getAssignments} from '../utils/api/apiHandlers/getAssignments';
import {useQuery} from '@tanstack/react-query';
import {getDocument} from '../utils/api/apiHandlers/getDocument';

interface UseMapBrowserEventsV2Props {
  mapId: string;
  isEditing: boolean;
}

export const useMapBrowserEvents = ({isEditing, mapId}: UseMapBrowserEventsV2Props) => {
  // VISIBILITY BEHAVIOR
  const {isVisible} = useVisibilityState();
  const unloadTimepoutRef = useRef<NodeJS.Timeout | null>(null);
  const setAppLoadingState = useMapStore(state => state.setAppLoadingState);
  const setIsEditing = useMapStore(state => state.setIsEditing);
  const mapDocument = useMapStore(state => state.mapDocument);
  const loadZoneAssignments = useMapStore(state => state.loadZoneAssignments);
  const setMapDocument = useMapStore(state => state.setMapDocument);
  const setErrorNotification = useMapStore(state => state.setErrorNotification);

  const {
    data: mapDocumentData,
    refetch: refetchMapDocument,
    isLoading: isLoadingDocument,
    isFetching: isFetchingDocument,
    error: mapDocumentError,
  } = useQuery({
    queryKey: ['mapDocument', mapId],
    queryFn: () => getDocument(mapId),
    staleTime: 0,
    placeholderData: _ => null,
    refetchOnWindowFocus: false,
  });

  const {
    data: assignmentsData,
    refetch: refetchAssignments,
    isLoading: isLoadingAssignments,
    isFetching: isFetchingAssignments,
    error: assignmentsError,
  } = useQuery({
    queryKey: ['assignments', mapDocumentData?.document_id],
    queryFn: () => getAssignments(mapDocumentData),
    staleTime: 0,
    placeholderData: _ => null,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (
      mapDocumentData &&
      (mapDocumentData.document_id === mapId || `${mapDocumentData?.public_id}` === mapId)
    ) {
      const prevIsSameId = mapDocument?.document_id === mapDocumentData?.document_id;
      const remoteHasUpdated =
        mapDocumentData?.updated_at &&
        mapDocument?.updated_at &&
        new Date(mapDocumentData.updated_at) > new Date(mapDocument.updated_at);
      if (!prevIsSameId || remoteHasUpdated) {
        setMapDocument(mapDocumentData);
      }
      if (prevIsSameId && remoteHasUpdated) {
        refetchAssignments();
      }
    }
  }, [mapDocumentData, setMapDocument]);

  useEffect(() => {
    if (assignmentsData) {
      loadZoneAssignments(assignmentsData);
    }
  }, [assignmentsData, loadZoneAssignments]);

  useEffect(() => {
    let errorText = '';
    // let errorText = `We couldn't find the map you're looking for with the ID ${mapId}.`;
    if (mapDocumentError && assignmentsError) {
      errorText = `We couldn't find the map you're looking for with the ID ${mapId} and the district assignments associated with it.`;
    } else if (mapDocumentError) {
      errorText = `We couldn't find the map you're looking for with the ID ${mapId}.`;
    } else if (assignmentsError) {
      errorText = `We couldn't find the district assignments for the map with the ID ${mapId}.`;
    }
    if (errorText) {
      errorText += `\n Please make sure you have the right map ID and try reloading the page. If the problem persists, please contact Districtr support with the error ID below.`;
      setErrorNotification({
        message: errorText,
        id: `map-not-found-${mapId}`,
        severity: 1,
      });
    }
  }, [mapDocumentError, assignmentsError, setErrorNotification]);
  // SET EDITING MODE
  useEffect(() => {
    setIsEditing(isEditing);
  }, [isEditing, setIsEditing]);

  // RESUME TEMPORAL STATES ON TAB RE-FOCUS
  useEffect(() => {
    if (isVisible) {
      // resume temporal states on tab re-focus
      useMapStore.temporal.getState().resume();
      // setAppLoadingState('loaded');
      if (unloadTimepoutRef.current) {
        clearTimeout(unloadTimepoutRef.current);
        unloadTimepoutRef.current = null;
      } else {
        refetchMapDocument();
      }
    } else {
      // prevent temporal states from generating while tab is not visible
      unloadTimepoutRef.current && clearTimeout(unloadTimepoutRef.current);
      useMapStore.temporal.getState().pause();
      setAppLoadingState('blurred');
      // unlock map doc on blurred (only in edit mode)
      if (isEditing) {
        const documentId = useMapStore.getState().mapDocument?.document_id;
        if (documentId) {
          unloadTimepoutRef.current = setTimeout(() => {
            unlockMapDocument(documentId);
            unloadTimepoutRef.current = null;
          }, FE_UNLOCK_DELAY);
        }
      }
    }

    return () => {
      if (unloadTimepoutRef.current) {
        clearTimeout(unloadTimepoutRef.current);
      }
    };
  }, [isVisible, isEditing]);

  // UNLOAD BEHAVIOR (only in edit mode)
  const handleUnload = useCallback(() => {
    if (isEditing) {
      // update db such that doc is no longer locked
      const mapDocument = useMapStore.getState().mapDocument;
      if (mapDocument && mapDocument.document_id) {
        const formData = new FormData();
        const userID = useMapStore.getState().userID;
        if (userID) {
          formData.append('user_id', userID);
          // sendbeacon ensures that the request is sent even if the tab is closed
          navigator.sendBeacon(
            `${process.env.NEXT_PUBLIC_API_URL}/api/document/${mapDocument.document_id}/unload`,
            formData
          );
        }
        console.log('Document is now unlocked');
      }
    }
  }, [isEditing]);

  useEffect(() => {
    window.addEventListener('unload', handleUnload);
    return () => {
      window.removeEventListener('unload', handleUnload);
    };
  }, [handleUnload]);

  return {
    isFetchingDocument,
    isFetchingAssignments,
    isLoadingDocument,
    isLoadingAssignments,
  };
};
