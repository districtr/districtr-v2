import {useState, useEffect} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {fetchDocument, SyncConflictInfo} from '@/app/utils/api/apiHandlers/fetchDocument';
import {SyncConflictModal} from '@/app/components/SyncConflictModal';
import {SyncConflictResolution} from '@/app/constants/types';
import {formatAssignmentsFromDocument} from '../utils/map/formatAssignments';
import {formatCoiAssignmentsFromDocument} from '../utils/map/formatCoiAssignments';
import {usePathname, useRouter} from 'next/navigation';
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
  const mapMode = useMapControlsStore(state => state.mapMode);
  const ingestDistrictFromDocument = useAssignmentsStore(state => state.ingestFromDocument);
  const ingestCoiFromDocument = useCoiAssignmentsStore(state => state.ingestFromDocument);
  const districtResolveConflict = useAssignmentsStore(state => state.resolveConflict);
  const coiResolveConflict = useCoiAssignmentsStore(state => state.resolveConflict);
  const router = useRouter();
  const pathname = usePathname();
  const isCoiRoute = pathname?.startsWith('/coi') || mapMode === 'coi';
  const isDistrictRoute = pathname?.startsWith('/map');

  const handleConflict = async (resolution: SyncConflictResolution) => {
    if (!conflictInfo) {
      setError(new Error('No conflict info to resolve'));
      setIsLoading(false);
      return;
    }
    try {
      const isCommunityDocument =
        conflictInfo.serverDocument.map_type === 'community' ||
        conflictInfo.localDocument.map_type === 'community';
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
        console.warn('[hydration] fetchDocument failed:', result.error);
        if (result.response) {
          setConflictInfo(result.response);
          setShowConflictModal(true);
        } else {
          setError(new Error(result.error));
          setIsLoading(false);
        }
        return;
      } else {
        const isCommunityDocument = result.response.document.map_type === 'community';
        // console.log('[hydration] Document loaded', {
        //   document_id,
        //   isCommunityDocument,
        //   map_type: result.response.document.map_type,
        //   isCoiRoute,
        //   isDistrictRoute,
        //   assignmentCount: result.response.assignments.length,
        //   community_metadata_list_count:
        //     result.response.document.community_metadata_list?.length ?? 0,
        //   num_communities: result.response.document.num_communities,
        //   document_comments_count: result.response.document.document_comments?.length ?? 0,
        // });
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
          // console.log('[hydration] Formatted COI assignments', {
          //   communityCount: data.communityAssignments.size,
          //   communities: Array.from(data.communityAssignments.entries()).map(([zone, geoids]) => ({
          //     zone,
          //     geoCount: geoids.size,
          //   })),
          //   shatterParents: data.shatterIds.parents.size,
          //   shatterChildren: data.shatterIds.children.size,
          // });
          ingestCoiFromDocument(data, result.response.document);
        } else {
          const data = formatAssignmentsFromDocument(result.response.assignments);
          ingestDistrictFromDocument(data, result.response.document);
        }
        // Set overlays from document response
        setMapDocument(result.response.document);
        setIsLoading(false);
        setAppLoadingState('loaded');
        // console.log('[hydration] Hydration complete, appLoadingState set to loaded');
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
