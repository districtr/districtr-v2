import {useState, useEffect, useCallback} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {
  fetchDocumentWithSync,
  SyncConflictInfo,
  SyncConflictResolution,
  DocumentFetchResult,
} from '@/app/utils/api/apiHandlers/fetchDocumentWithSync';
import {SyncConflictModal} from '@/app/components/SyncConflictModal';
import {Assignment} from '@/app/utils/api/apiHandlers/types';

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
  const [pendingResolution, setPendingResolution] = useState<
    ((resolution: SyncConflictResolution) => void) | null
  >(null);

  const setMapDocument = useMapStore(state => state.setMapDocument);
  const setAppLoadingState = useMapStore(state => state.setAppLoadingState);
  const replaceZoneAssignments = useAssignmentsStore(state => state.replaceZoneAssignments);

  const handleConflict = useCallback(
    (conflict: SyncConflictInfo): Promise<SyncConflictResolution> => {
      return new Promise(resolve => {
        setConflictInfo(conflict);
        setShowConflictModal(true);
        setPendingResolution(() => (resolution: SyncConflictResolution) => {
          setShowConflictModal(false);
          setConflictInfo(null);
          resolve(resolution);
        });
      });
    },
    []
  );

  const loadDocument = useCallback(async () => {
    if (!document_id || !enabled) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result: DocumentFetchResult = await fetchDocumentWithSync(document_id, handleConflict);

      // Set the document in the store
      setMapDocument(result.document);

      // Convert assignments array to Map for the store (works for both local and remote)
      const assignmentsMap = new Map<string, number | null>();
      result.assignments.forEach(assignment => {
        assignmentsMap.set(assignment.geo_id, assignment.zone);
      });
      replaceZoneAssignments(assignmentsMap);

      // If we used server version, update IDB to keep it in sync
      if (result.source === 'remote') {
        const {idb} = await import('@/app/utils/idb/idb');
        await idb.updateDocument({
          id: document_id,
          document_metadata: result.document,
          assignments: result.assignments,
          clientLastUpdated: new Date().toISOString(),
        });
      }

      setAppLoadingState('loaded');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load document');
      setError(error);
      setAppLoadingState('initializing');
    } finally {
      setIsLoading(false);
    }
  }, [document_id, enabled, handleConflict, setMapDocument, replaceZoneAssignments, setAppLoadingState]);

  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  const handleConflictResolution = useCallback(
    (resolution: SyncConflictResolution) => {
      if (pendingResolution) {
        pendingResolution(resolution);
        setPendingResolution(null);
        // Reload document after resolution
        loadDocument();
      }
    },
    [pendingResolution, loadDocument]
  );

  return {
    isLoading,
    error,
    conflictModal: conflictInfo ? (
      <SyncConflictModal
        open={showConflictModal}
        conflict={conflictInfo}
        onResolve={handleConflictResolution}
      />
    ) : null,
  };
}

