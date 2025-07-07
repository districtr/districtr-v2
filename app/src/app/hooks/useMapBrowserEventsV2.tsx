import {useMapStore} from '@/app/store/mapStore';
import {updateDocumentFromId, updateGetDocumentFromId} from '@utils/api/queries';
import {jwtDecode} from 'jwt-decode';
import {sharedDocument} from '@utils/api/mutations';
import {unlockMapDocument} from '@utils/api/apiHandlers/unlockMapDocument';
import {useCallback, useEffect, useRef} from 'react';
import {useSearchParams} from 'next/navigation';
import {useVisibilityState} from './useVisibilityState';
import {FE_UNLOCK_DELAY} from '../utils/api/constants';

interface UseMapBrowserEventsV2Props {
  mapId: string;
  isEditing: boolean;
}

export const useMapBrowserEventsV2 = ({mapId, isEditing}: UseMapBrowserEventsV2Props) => {
  // VISIBILITY BEHAVIOR
  const {isVisible} = useVisibilityState();
  const unloadTimepoutRef = useRef<NodeJS.Timeout | null>(null);
  const setAppLoadingState = useMapStore(state => state.setAppLoadingState);
  const setPasswordPrompt = useMapStore(state => state.setPasswordPrompt);
  const setIsEditing = useMapStore(state => state.setIsEditing);

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

  // SHARE BEHAVIOR
  const receivedShareToken = useMapStore(state => state.receivedShareToken);
  const setReceivedShareToken = useMapStore(state => state.setReceivedShareToken);
  const mapDocument = useMapStore(state => state.mapDocument);
  const searchParams = useSearchParams();
  const shareToken = searchParams.get('share');

  useEffect(() => {
    if (mapId && mapId !== mapDocument?.document_id) {
      updateGetDocumentFromId(mapId);
    }
    if (shareToken && !receivedShareToken) {
      const decodedToken = jwtDecode(shareToken);
      setReceivedShareToken((decodedToken as any).token as string);
      if ((decodedToken as any)?.password_required) {
        setPasswordPrompt(true);
      } else {
        setReceivedShareToken((decodedToken as any).token as string);
        sharedDocument.mutate({
          token: (decodedToken as any).token as string,
          password: null,
          access: (decodedToken as any).access as string,
          status: (decodedToken as any).status as string,
        });
      }
    }
  }, [
    mapId,
    shareToken,
    receivedShareToken,
    setReceivedShareToken,
    setPasswordPrompt,
    mapDocument?.document_id,
  ]);

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
