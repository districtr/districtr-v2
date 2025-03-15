import {useMapStore} from '@/app/store/mapStore';
import {updateDocumentFromId, updateGetDocumentFromId} from './queries';
import {jwtDecode} from 'jwt-decode';
export let previousDocumentID = '';
import {sharedDocument} from './mutations';
import {unloadMapDocument} from './apiHandlers';

export const getSearchParamsObserver = () => {
  // next ssr safety
  if (typeof window === 'undefined') {
    return;
  }

  // listener for tab refocus
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      // resume temporal states on tab re-focus
      useMapStore.temporal.getState().resume();
      useMapStore.getState().setAppLoadingState('loaded');
      updateDocumentFromId.refetch();
    } else {
      // prevent temporal states from generating while tab is not visible
      useMapStore.temporal.getState().pause();
      useMapStore.getState().setAppLoadingState('blurred');
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  // listener for closing the tab
  const handleUnload = () => {
    // update db such that doc is no longer locked
    alert('unloading');
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
    } else {
      alert('not properly unlocked');
    }
  };
  window.addEventListener('unload', handleUnload);

  // listener for url changes
  let previousDocumentID = '';
  const observer = new MutationObserver(() => {
    const documentId = new URLSearchParams(window.location.search).get('document_id');
    const shareToken = new URLSearchParams(window.location.search).get('share');

    if (documentId && documentId !== previousDocumentID) {
      previousDocumentID = documentId;
      updateGetDocumentFromId(documentId);
    }
    if (shareToken) {
      const decodedToken = jwtDecode(shareToken);

      useMapStore.getState().setReceivedShareToken((decodedToken as any).token as string);
      if ((decodedToken as any).password_required === true) {
        useMapStore.getState().setPasswordPrompt(true);
      } else {
        sharedDocument.mutate({
          token: (decodedToken as any).token as string,
          password: null,
          access: (decodedToken as any).access as string,
          status: (decodedToken as any).status as string,
        });
      }
    }
  });
  const config = {subtree: true, childList: true};
  // start listening to changes
  observer.observe(document, config);
  return observer;
};
