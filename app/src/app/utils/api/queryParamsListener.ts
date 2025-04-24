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
  let previousRowNumber = '';
  let previousPathname = window.location.pathname;
  
  const observer = new MutationObserver(() => {
    const currentPathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const documentId = searchParams.get('document_id');
    const queryRowNumber = searchParams.get('row_number');
    const shareToken = searchParams.get('share');

    // Check if the URL is a map route with ID parameter
    const mapRouteMatch = currentPathname.match(/^\/map\/(\d+)$/);
    const routeRowId = mapRouteMatch ? mapRouteMatch[1] : null;
    
    // If the pathname has changed and it's a map route with ID
    if (currentPathname !== previousPathname && routeRowId) {
      previousPathname = currentPathname;
      previousRowNumber = routeRowId;
      previousDocumentID = ''; // Reset document_id tracking when using row_number
      updateGetDocumentFromId(undefined, routeRowId);
    }
    // Handle document_id (backward compatibility)
    else if (documentId && documentId !== previousDocumentID) {
      previousDocumentID = documentId;
      previousRowNumber = ''; // Reset row number tracking when using document_id
      updateGetDocumentFromId(documentId);
    }
    // Handle query param row_number (backward compatibility)
    else if (queryRowNumber && queryRowNumber !== previousRowNumber) {
      previousRowNumber = queryRowNumber;
      previousDocumentID = ''; // Reset document_id tracking when using row_number
      updateGetDocumentFromId(undefined, queryRowNumber);
    }
    
    // Handle share token
    if (shareToken && !useMapStore.getState().receivedShareToken) {
      const decodedToken = jwtDecode(shareToken);

      useMapStore.getState().setReceivedShareToken((decodedToken as any).token as string);

      console.log('running here again');
      sharedDocument.mutate({
        token: (decodedToken as any).token as string,
        password: null,
        access: (decodedToken as any).access as string,
        status: (decodedToken as any).status as string,
      });
    }
  });
  const config = {subtree: true, childList: true};
  // start listening to changes
  observer.observe(document, config);
  return observer;
};
