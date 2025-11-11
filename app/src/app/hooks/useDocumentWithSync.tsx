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
import {idb} from '@/app/utils/idb/idb';
import { formatAssignmentsFromDocument } from '../utils/map/formatAssignments';
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
  const ingestFromDocument = useAssignmentsStore(state => state.ingestFromDocument);
  
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
      console.log("!!!", result)
      // Set the document in the store
      setMapDocument(result.document);
      const stateUpdates = formatAssignmentsFromDocument(result.assignments);
      ingestFromDocument(stateUpdates);
      // Handle conflict resolution
      if (result.conflictResolution === 'use-local') {
        // Load assignments from IDB and upload to server
        const localDoc = await idb.getDocument(result.document.document_id);
        if (localDoc) {
          const stateUpdates = formatAssignmentsFromDocument(localDoc.assignments);
          await ingestFromDocument(stateUpdates);
          // Upload to server - this will update IDB internally
          const handlePutAssignments = useAssignmentsStore.getState().handlePutAssignments;
          await handlePutAssignments();

          // After upload, fetch fresh document and assignments to update store
          const {getDocument} = await import('@/app/utils/api/apiHandlers/getDocument');
          const {getAssignments} = await import('@/app/utils/api/apiHandlers/getAssignments');
          const freshDocResponse = await getDocument(result.document.document_id);
          if (freshDocResponse.ok && 'response' in freshDocResponse) {
            const freshDoc = freshDocResponse.response;
            // Update map store with fresh document
            setMapDocument(freshDoc);
            
            // Get fresh assignments and update store
            const freshAssignments = await getAssignments(freshDoc);
            if (freshAssignments.ok && 'response' in freshAssignments) {
              const freshAssignmentsMap = new Map<string, number | null>();
              freshAssignments.response.assignments.forEach(assignment => {
                freshAssignmentsMap.set(assignment.geo_id, assignment.zone);
              });
              replaceZoneAssignments(freshAssignmentsMap);
            }
          }
        }
      } else if (result.conflictResolution === 'keep-local') {
        // Already handled in fetchDocumentWithSync - IDB is updated with updated document metadata
        // The document and assignments are already loaded above from result
        // Document is already set in map store at the beginning of this function
      } else if (result.source === 'remote') {
        // If we used server version, IDB is already updated in fetchDocumentWithSync
        // No additional action needed
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
        // Don't reload - the resolution is handled within the current loadDocument call
      }
    },
    [pendingResolution]
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

