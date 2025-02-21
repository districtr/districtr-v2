import {useMapStore} from '@/app/store/mapStore';
import {updateDocumentFromId, updateGetDocumentFromId} from './queries';
import {jwtDecode} from 'jwt-decode';
export let previousDocumentID = '';
import {sharedDocument} from './mutations';

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
      const decodedToken = jwtDecode(shareToken);

      useMapStore.getState().setReceivedShareToken((decodedToken as any).token as string);

      if ((decodedToken as any).password_required === true) {
        useMapStore.getState().setPasswordPrompt(true);
      } else {
        sharedDocument.mutate({
          token: (decodedToken as any).token as string,
          password: null,
        });
      }
    }
  });
  console.log('starting observer');
  const config = {subtree: true, childList: true};
  // start listening to changes
  observer.observe(document, config);
  return observer;
};
