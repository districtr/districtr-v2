import {useState, useEffect} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {fetchDocument, SyncConflictInfo} from '@/app/utils/api/apiHandlers/fetchDocument';
import {SyncConflictModal} from '@/app/components/SyncConflictModal';
import {SyncConflictResolution} from '@constants/document/sync';
import {formatAssignmentsFromDocument} from '../utils/map/formatAssignments';
import {formatCoiAssignmentsFromDocument} from '../utils/map/formatCoiAssignments';
import {useRouter} from 'next/navigation';
import {MAP_MODES} from '@constants/map/mode';
import {MAP_TYPES} from '@constants/document/types';
import {APP_LOADING_STATES} from '@constants/document/state';

interface UseDocumentWithSyncOptions {
  document_id: string | null | undefined;
  enabled?: boolean;
  isPublicPage?: boolean;
}

/**
 * Hook to fetch a document with sync support between IDB and server.
 * Handles conflict resolution and loads assignments accordingly.
 */
export function useDocumentWithSync({
  document_id,
  enabled = true,
  isPublicPage = false,
}: UseDocumentWithSyncOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [conflictInfo, setConflictInfo] = useState<SyncConflictInfo | null>(null);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const setMapDocument = useMapStore(state => state.setMapDocument);
  const setAppLoadingState = useMapStore(state => state.setAppLoadingState);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const ingestDistrictFromDocument = useAssignmentsStore(state => state.ingestFromDocument);
  const ingestCoiFromDocument = useCoiAssignmentsStore(state => state.ingestFromDocument);
  const districtResolveConflict = useAssignmentsStore(state => state.resolveConflict);
  const coiResolveConflict = useCoiAssignmentsStore(state => state.resolveConflict);
  const router = useRouter();
  const isCoiRoute = mapMode === MAP_MODES.COI;
  const isDistrictRoute = mapMode === MAP_MODES.DISTRICTS;

  const handleConflict = async (resolution: SyncConflictResolution) => {
    if (!conflictInfo) {
      setError(new Error('No conflict info to resolve'));
      setIsLoading(false);
      return;
    }
    try {
      const isCommunityDocument =
        conflictInfo.serverDocument.map_type === MAP_TYPES.COMMUNITY ||
        conflictInfo.localDocument.map_type === MAP_TYPES.COMMUNITY;
      const resolveConflict = isCommunityDocument ? coiResolveConflict : districtResolveConflict;
      await resolveConflict(resolution, conflictInfo, {
        context: 'load',
        onNavigate: documentId => {
          router.push(isCommunityDocument ? `/coi/edit/${documentId}` : `/map/edit/${documentId}`);
        },
        onComplete: () => {
          setIsLoading(false);
          setConflictInfo(null);
          setShowConflictModal(false);
          setAppLoadingState(APP_LOADING_STATES.LOADED);
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to resolve conflict'));
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const mapDocument = useMapStore.getState().mapDocument;
    if (mapDocument?.document_id === document_id) {
      return;
    }
    // Guard against stale-load races: if the user switches documents mid-fetch, we
    // must not let the earlier doc's ingest/setMapDocument land on top of the newer
    // doc's state. `cancelled` short-circuits every mutation below.
    let cancelled = false;

    const loadDocument = async () => {
      if (!document_id || !enabled) {
        return;
      }

      setIsLoading(true);
      setError(null);

      const result = await fetchDocument(document_id);
      if (cancelled) return;

      if (!result.ok) {
        console.warn('[hydration] fetchDocument failed:', result.error);
        if (result.response) {
          setConflictInfo(result.response);
          setShowConflictModal(true);
        } else {
          setError(new Error(result.error));
          setIsLoading(false);
        }
      } else if (isPublicPage) {
        const isCommunityDocument = result.response.document.map_type === MAP_TYPES.COMMUNITY;
        setMapDocument(result.response.document);
        // District public views render via PublicSource (aggregated stats endpoint).
        // Community public views have no equivalent stats path, so load individual
        // community assignments here so CoiMap can color zones on the read-only page.
        if (isCommunityDocument) {
          const data = formatCoiAssignmentsFromDocument(result.response.assignments);
          ingestCoiFromDocument(data, result.response.document);
        }
        setIsLoading(false);
        setAppLoadingState(APP_LOADING_STATES.LOADED);
      } else {
        const isCommunityDocument = result.response.document.map_type === MAP_TYPES.COMMUNITY;
        if (isCoiRoute && !isCommunityDocument) {
          setError(
            new Error('This document is not a community map. Open it from the district editor.')
          );
          setIsLoading(false);
          return;
        }
        if (isDistrictRoute && isCommunityDocument) {
          setError(
            new Error('This document is a community map. Open it from the community editor.')
          );
          setIsLoading(false);
          return;
        }

        setMapDocument(result.response.document);
        if (isCommunityDocument) {
          const data = formatCoiAssignmentsFromDocument(result.response.assignments);
          ingestCoiFromDocument(data, result.response.document);
        } else {
          const data = formatAssignmentsFromDocument(result.response.assignments);
          ingestDistrictFromDocument(data, result.response.document);
        }
        if (result.response.hasLocalEdits) {
          useMapStore.setState({updated: {metadata: true, comments: true}});
        }
        setIsLoading(false);
        setAppLoadingState(APP_LOADING_STATES.LOADED);
        return;
      }
    };
    loadDocument();

    return () => {
      cancelled = true;
    };
  }, [document_id, enabled, isPublicPage, isCoiRoute, isDistrictRoute]);

  return {
    isLoading,
    error,
    conflictModal: conflictInfo ? (
      <SyncConflictModal
        open={showConflictModal}
        conflict={conflictInfo}
        onResolve={handleConflict}
        loading={false}
      />
    ) : null,
  };
}
