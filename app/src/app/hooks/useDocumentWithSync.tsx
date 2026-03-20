import {useState, useEffect} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {
  fetchDocument,
  SyncConflictInfo,
  SyncConflictResolution,
} from '@/app/utils/api/apiHandlers/fetchDocument';
import {SyncConflictModal} from '@/app/components/SyncConflictModal';
import {formatAssignmentsFromDocument} from '../utils/map/formatAssignments';
import {formatCoiAssignmentsFromDocument} from '../utils/map/formatCoiAssignments';
import {usePathname, useRouter} from 'next/navigation';
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
  const resolveConflict = useAssignmentsStore(state => state.resolveConflict);
  const router = useRouter();
  const pathname = usePathname();
  const isCoiRoute = pathname?.startsWith('/coi') || mapMode === 'coi';

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
          router.push(isCoiRoute ? `/coi/edit/${documentId}` : `/map/edit/${documentId}`);
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
      } else if (isPublicPage) {
        setMapDocument(result.response.document);
        setIsLoading(false);
        setAppLoadingState('loaded');
      } else {
        setMapDocument(result.response.document);
        if (isCoiRoute) {
          const data = formatCoiAssignmentsFromDocument(result.response.assignments);
          ingestCoiFromDocument(
            {
              communityAssignments: data.communityAssignments,
              communtyVisibility: new Map(),
              shatterIds: data.shatterIds,
              parentToChild: data.parentToChild,
              childToParent: data.childToParent,
            },
            result.response.updateLocal ? result.response.document : undefined
          );
        } else {
          const data = formatAssignmentsFromDocument(result.response.assignments);
          ingestDistrictFromDocument(
            {
              zoneAssignments: data.zoneAssignments,
              shatterIds: data.shatterIds,
              parentToChild: data.parentToChild,
              childToParent: data.childToParent,
            },
            result.response.updateLocal ? result.response.document : undefined
          );
        }
        // Set overlays from document response
        setMapDocument(result.response.document);
        setIsLoading(false);
        setAppLoadingState('loaded');
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
