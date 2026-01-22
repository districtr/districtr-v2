import {useState, useEffect} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {
  fetchDocument,
  SyncConflictInfo,
  SyncConflictResolution,
} from '@/app/utils/api/apiHandlers/fetchDocument';
import {SyncConflictModal} from '@/app/components/SyncConflictModal';
import {formatAssignmentsFromDocument} from '../utils/map/formatAssignments';
import {useRouter} from 'next/navigation';
interface UseDocumentWithSyncOptions {
  document_id: string | null | undefined;
  enabled?: boolean;
}

/**
 * Hook to fetch a document with sync support between IDB and server.
 * Handles conflict resolution and loads assignments accordingly.
 */
export function useDocumentWithSync({document_id, enabled = true}: UseDocumentWithSyncOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [conflictInfo, setConflictInfo] = useState<SyncConflictInfo | null>(null);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const setMapDocument = useMapStore(state => state.setMapDocument);
  const setAppLoadingState = useMapStore(state => state.setAppLoadingState);
  const ingestFromDocument = useAssignmentsStore(state => state.ingestFromDocument);
  const resolveConflict = useAssignmentsStore(state => state.resolveConflict);
  const setAvailableOverlays = useOverlayStore(state => state.setAvailableOverlays);
  const clearOverlays = useOverlayStore(state => state.clearOverlays);
  const router = useRouter();

  const handleConflict = async (resolution: SyncConflictResolution) => {
    if (!conflictInfo) {
      setError(new Error('No conflict info to resolve'));
      setIsLoading(false);
      return;
    }
    try {
      await resolveConflict(resolution, conflictInfo, {
        context: 'load',
        onNavigate: documentId => {
          router.push(`/map/edit/${documentId}`);
        },
        onComplete: () => {
          setIsLoading(false);
          setConflictInfo(null);
          setShowConflictModal(false);
          setAppLoadingState('loaded');
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
    const loadDocument = async () => {
      if (!document_id || !enabled) {
        return;
      }

      setIsLoading(true);
      setError(null);

      const result = await fetchDocument(document_id);
      if (!result.ok) {
        if (result.response) {
          setConflictInfo(result.response);
          setShowConflictModal(true);
        } else {
          setError(new Error(result.error));
          setIsLoading(false);
        }
        return;
      } else {
        setMapDocument(result.response.document);
        const data = formatAssignmentsFromDocument(result.response.assignments);
        ingestFromDocument(
          {
            zoneAssignments: data.zoneAssignments,
            shatterIds: data.shatterIds,
            parentToChild: data.parentToChild,
            childToParent: data.childToParent,
          },
          result.response.updateLocal ? result.response.document : undefined
        );
        // Set overlays from document response
        clearOverlays();
        if (result.response.document.overlays) {
          setAvailableOverlays(result.response.document.overlays);
        }
        setIsLoading(false);
        setAppLoadingState('loaded');
        return;
      }
    };
    loadDocument();
  }, [document_id, enabled]);

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
