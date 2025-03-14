import {useMapStore} from '@/app/store/mapStore';
import {updateDocumentFromId, updateGetDocumentFromId} from './queries';
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
      useMapStore.getState().setAppLoadingState('loaded');
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
    if (documentId && documentId !== previousDocumentID) {
      previousDocumentID = documentId;
      updateGetDocumentFromId(documentId);
    }
  });
  const config = {subtree: true, childList: true};
  // start listening to changes
  observer.observe(document, config);
  return observer;
};
