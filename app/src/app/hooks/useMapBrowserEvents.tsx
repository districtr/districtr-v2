import {useMapStore} from '@/app/store/mapStore';
import {updateDocumentFromId, updateGetDocumentFromId} from '@utils/api/queries';
import {unlockMapDocument} from '@utils/api/apiHandlers/unlockMapDocument';
import {useCallback, useEffect, useRef} from 'react';
import {useVisibilityState} from './useVisibilityState';
import {FE_UNLOCK_DELAY} from '../utils/api/constants';
import {DocumentObject} from '@/app/utils/api/apiHandlers/types';
import {getAssignments} from '../utils/api/apiHandlers/getAssignments';

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
  const setErrorNotification = useMapStore(state => state.setErrorNotification);
  const loadZoneAssignments = useMapStore(state => state.loadZoneAssignments);
  const prevMapDocument = useRef<DocumentObject | null>(null);

  // UPDATE MAP ID STATE ON URL CHANGE
  useEffect(() => {
    if (mapId && mapId !== mapDocument?.document_id) {
      updateGetDocumentFromId(mapId);
    }
  }, [mapId, mapDocument?.document_id]);

  // GET ASSIGNMENTS ON MAP DOCUMENT CHANGE
  // TODO - this could be a useQuery that doesn't hold the assignments in state twice
  useEffect(() => {
    const prev = prevMapDocument.current;
    const curr = mapDocument;
    const isInitialDocument = !prev;
    const remoteHasUpdated =
      curr?.updated_at && prev?.updated_at && new Date(curr.updated_at) > new Date(prev.updated_at);
    const mapDocumentChanged = curr?.document_id !== prev?.document_id;
    if (curr && (isInitialDocument || remoteHasUpdated || mapDocumentChanged)) {
      getAssignments(curr).then(data => {
        if (data === null) {
          setErrorNotification({
            severity: 2,
            id: 'assignments-not-found',
            message: 'Assignments not found',
          });
        } else {
          prevMapDocument.current = structuredClone(curr);
          loadZoneAssignments(data);
        }
      });
    }
  }, [mapDocument, setErrorNotification, loadZoneAssignments]);

  // SET EDITING MODE
  useEffect(() => {
    setIsEditing(isEditing);
  }, [isEditing, setIsEditing]);

  // RESUME TEMPORAL STATES ON TAB RE-FOCUS
  useEffect(() => {
    if (isVisible) {
      // resume temporal states on tab re-focus
      useMapStore.temporal.getState().resume();
      setAppLoadingState('loaded');
      updateDocumentFromId.refetch(); // confirms map lock status on tab re-focus
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
};
