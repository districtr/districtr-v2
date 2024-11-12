import {useMapStore} from '@/app/store/mapStore';
import {updateDocumentFromId, updateGetDocumentFromId} from './queries';
export let previousDocumentID = '';

export const getSearchParamsObersver = () => {
  // next ssr safety
  if (typeof window === 'undefined') {
    return;
  }

  // listener for tab refocus
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      updateDocumentFromId.refetch();
    } else {
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
