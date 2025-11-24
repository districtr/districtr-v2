import {useState, useEffect, useCallback, use} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {
  fetchDocument,
  SyncConflictInfo,
  SyncConflictResolution,
} from '@/app/utils/api/apiHandlers/fetchDocument';
import {SyncConflictModal} from '@/app/components/SyncConflictModal';
import {idb} from '@/app/utils/idb/idb';
import {formatAssignmentsFromDocument} from '../utils/map/formatAssignments';
import {createMapDocument} from '@/app/utils/api/apiHandlers/createMapDocument';
import {redirect, useRouter} from 'next/navigation';
import { postUpdateAssignmentsAndVerify } from '../utils/api/apiHandlers/postUpdateAssignmentsAndVerify';
import { getAssignments } from '../utils/api/apiHandlers/getAssignments';
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
  const router = useRouter();

  const setMapDocument = useMapStore(state => state.setMapDocument);
  const setAppLoadingState = useMapStore(state => state.setAppLoadingState);
  const replaceZoneAssignments = useAssignmentsStore(state => state.replaceZoneAssignments);
  const ingestFromDocument = useAssignmentsStore(state => state.ingestFromDocument);
  const handlePutAssignments = useAssignmentsStore(state => state.handlePutAssignments);
  const setClientLastUpdated = useAssignmentsStore(state => state.setClientLastUpdated);

  const handleConflict = useCallback(
    async (resolution: SyncConflictResolution) => {
      if (!conflictInfo) {
        setError(new Error('No conflict info to resolve'));
        setIsLoading(false);
        return;
      }
      switch (resolution) {
        case 'use-local': {
          setMapDocument(conflictInfo?.localDocument);
          const assignments = await idb.getDocument(conflictInfo?.localDocument.document_id);  
          if (!assignments) {
            setError(new Error('No assignments found in IDB'));
            break;
          }
          const data = formatAssignmentsFromDocument(assignments.assignments);
          ingestFromDocument({
            zoneAssignments: data.zoneAssignments,
            shatterIds: data.shatterIds,
            shatterMappings: data.shatterMappings,
          });
          const response = await postUpdateAssignmentsAndVerify({
            mapDocument: conflictInfo?.localDocument,
            zoneAssignments: data.zoneAssignments,
            shatterIds: data.shatterIds,
            shatterMappings: data.shatterMappings,
            overwrite: true,
          });
          if (!response.ok) {
            setError(new Error('Failed to post assignments'));
            break;
          }
          setClientLastUpdated(response.response.updated_at);
          break;
        }
        case 'use-server': {
          const remoteAssignments = await getAssignments(conflictInfo?.serverDocument);
          setMapDocument(conflictInfo?.serverDocument);
          if (!remoteAssignments.ok) {
            setError(new Error('Failed to get remote assignments'));
            return;
          }
          const data = formatAssignmentsFromDocument(remoteAssignments.response);
          ingestFromDocument({
            zoneAssignments: data.zoneAssignments,
            shatterIds: data.shatterIds,
            shatterMappings: data.shatterMappings,
          }, conflictInfo?.serverDocument);
          break;
        }
        case 'keep-local': {
          const assignments = await idb.getDocument(conflictInfo?.localDocument.document_id);  
          if (!assignments) {
            setError(new Error('No assignments found in IDB'));
            break;
          }
          const data = formatAssignmentsFromDocument(assignments.assignments);
          setMapDocument(conflictInfo?.localDocument);
          ingestFromDocument({
            zoneAssignments: data.zoneAssignments,
            shatterIds: data.shatterIds,
            shatterMappings: data.shatterMappings,
          });
          break;
        }
        case 'fork': {
          const createMapDocumentResponse = await createMapDocument({
            districtr_map_slug: conflictInfo?.serverDocument.districtr_map_slug,
          });
          if (!createMapDocumentResponse.ok) {
            setError(new Error('Failed to create map document'));
            break;
          }
          const assignments = await idb.getDocument(conflictInfo?.localDocument.document_id);  
          if (!assignments) {
            setError(new Error('No assignments found in IDB'));
            break;
          }
          const data = formatAssignmentsFromDocument(assignments.assignments);
          const response = await postUpdateAssignmentsAndVerify({
            mapDocument: createMapDocumentResponse.response,
            zoneAssignments: data.zoneAssignments,
            shatterIds: data.shatterIds,
            shatterMappings: data.shatterMappings,
            overwrite: true,
          });
          if (!response.ok) {
            setError(new Error('Failed to post assignments'));
            break;
          }
          router.push(`/map/edit/${createMapDocumentResponse.response.document_id}`);
          break;
        }
    }
    setIsLoading(false);
    setConflictInfo(null);
    setShowConflictModal(false);
    setAppLoadingState('loaded');
  }, [conflictInfo, handlePutAssignments, setMapDocument, router])

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
        ingestFromDocument({
          zoneAssignments: data.zoneAssignments,
          shatterIds: data.shatterIds,
          shatterMappings: data.shatterMappings,
        }, result.response.updateLocal ? result.response.document : undefined);
        setClientLastUpdated(result.response.document.updated_at!);
        setIsLoading(false);
        setAppLoadingState('loaded');
        return;
      }
    }
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
      />
    ) : null,
  };
}
