import {useMapStore} from '@/app/store/mapStore';
import {updateDocumentFromId, updateGetDocumentFromId} from '@utils/api/queries';
import {unlockMapDocument} from '@utils/api/apiHandlers/unlockMapDocument';
import {useCallback, useEffect, useRef} from 'react';
import {useVisibilityState} from './useVisibilityState';
import {FE_UNLOCK_DELAY} from '../utils/api/constants';

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

  // Set editing mode
  useEffect(() => {
    setIsEditing(isEditing);
  }, [isEditing, setIsEditing]);

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

  useEffect(() => {
    if (mapId && mapId !== mapDocument?.document_id) {
      updateGetDocumentFromId(mapId);
    }
  }, [mapId, mapDocument?.document_id]);

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
