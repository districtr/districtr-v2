import {useMapStore} from '@/app/store/mapStore';
import {updateDocumentFromId, updateGetDocumentFromId} from './queries';
import {jwtDecode} from 'jwt-decode';
import {sharedDocument} from './mutations';
export let previousDocumentID = '';

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
      updateDocumentFromId.refetch();
    } else {
      // prevent temporal states from generating while tab is not visible
      useMapStore.temporal.getState().pause();
      useMapStore.getState().setAppLoadingState('blurred');
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  let previousDocumentID = '';
  const observer = new MutationObserver(() => {
    const documentId = new URLSearchParams(window.location.search).get('document_id');
    const shareToken = new URLSearchParams(window.location.search).get('share');
    if (documentId && documentId !== previousDocumentID) {
      previousDocumentID = documentId;
      updateGetDocumentFromId(documentId);
    }
    if (shareToken) {
      // decode; if password require, prompt for it; if not, fetch the map
      // if password is correct, fetch the map
      // if password is incorrect, show error
      const decodedToken = jwtDecode(shareToken);
      console.log('Decoded token: ', decodedToken);
      if ((decodedToken as any).password_required === true) {
        // prompt for password
        useMapStore.getState().setPasswordPrompt(true);

        // once password is submitted, fetch map
        sharedDocument.mutate(shareToken, useMapStore.getState().password);
      } else {
        // fetch map
        sharedDocument.mutate((decodedToken as any).token as string);
      }
    }
  });
  const config = {subtree: true, childList: true};
  // start listening to changes
  observer.observe(document, config);
  return observer;
};
