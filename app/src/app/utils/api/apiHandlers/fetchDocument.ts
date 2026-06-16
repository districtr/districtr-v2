import {DocumentObject, Assignment} from './types';
import {getDocument} from './getDocument';
import {idb} from '@/app/utils/idb/idb';
import {getAssignments} from './getAssignments';
import {isUUID} from '../../metadata/isUUID';
import {type SyncConflictResolution} from '@constants/document/sync';
import {MAP_TYPES} from '@constants/document/types';

export interface DocumentFetchResult {
  document: DocumentObject;
  assignments: Assignment[];
  source: 'local' | 'remote';
  conflictResolution?: SyncConflictResolution;
}

export interface SyncConflictInfo {
  localDocument: DocumentObject;
  localLastUpdated: string;
  serverDocument: DocumentObject;
  serverLastUpdated: string;
}

// If remote updated and public, fetch from server
// If conflict, return ok: false, conflict status
type FetchDocumentResult = Promise<
  | {
      ok: true;
      response: {
        document: DocumentObject;
        assignments: Assignment[];
        updateLocal?: boolean;
        hasLocalEdits?: boolean;
      };
    }
  | {
      ok: false;
      error: string;
      response?: SyncConflictInfo;
    }
>;
export const fetchDocument = async (
  document_id: string,
  source: 'remote' | 'local' | 'auto' = 'auto'
): FetchDocumentResult => {
  const isPublic = !isUUID(document_id);
  const [idbDocument, remoteMetadata] = await Promise.all([
    isPublic ? Promise.resolve(null) : idb.getDocument(document_id),
    getDocument(document_id),
  ]);

  // console.log('[hydration] fetchDocument:', {
  //   document_id,
  //   source,
  //   isPublic,
  //   hasIdb: !!idbDocument,
  //   idbAssignmentCount: idbDocument?.assignments?.length ?? 0,
  //   remoteOk: remoteMetadata.ok,
  // });

  if (!remoteMetadata.ok) {
    // console.error('[hydration] Remote metadata fetch failed:', remoteMetadata.error);
    // The backend has no record of this document (e.g. a local-only/offline map, or
    // the server lost it). If we hold a complete local copy, load that instead of
    // failing so the user keeps their map and can re-sync later.
    if (idbDocument) {
      return {
        ok: true,
        response: {
          document: idbDocument.document_metadata,
          assignments: idbDocument.assignments,
          updateLocal: false,
          hasLocalEdits: idbDocument.clientLastUpdated !== idbDocument.document_metadata.updated_at,
        },
      };
    }
    return {
      ok: false,
      error: remoteMetadata.error.detail || 'Failed to fetch document',
    };
  }

  if (isPublic) {
    // Community public views don't have a district-unions stats path, so fetch
    // raw assignments for them. District public views rely on PublicSource and
    // don't need per-geoid assignments here.
    const isCommunityPublic = remoteMetadata.response.map_type === MAP_TYPES.COMMUNITY;
    let assignments: Assignment[] = [];
    if (isCommunityPublic) {
      const remoteAssignments = await getAssignments(remoteMetadata.response);
      if (remoteAssignments.ok) {
        assignments = remoteAssignments.response;
      }
    }
    return {
      ok: true,
      response: {
        document: remoteMetadata.response,
        assignments,
        updateLocal: false,
      },
    };
  }

  // No local copy, or public document and remote has updates
  const remoteTimestamp = new Date(remoteMetadata.response.updated_at);
  const localTimestamp = new Date(
    idbDocument?.document_metadata.updated_at || '1970-01-01T00:00:00Z'
  );
  const remoteIsNewer = remoteTimestamp && remoteTimestamp > localTimestamp;
  if (
    !idbDocument ||
    (isPublic && remoteIsNewer) ||
    source === 'remote' ||
    idbDocument.shouldFetchAssignments === true
  ) {
    // console.log('[hydration] Fetching assignments from server', {
    //   reason: !idbDocument
    //     ? 'no IDB'
    //     : isPublic && remoteIsNewer
    //       ? 'public+newer'
    //       : source === 'remote'
    //         ? 'forced remote'
    //         : 'shouldFetchAssignments',
    //   map_type: remoteMetadata.response.map_type,
    // });
    const remoteAssignments = await getAssignments(remoteMetadata.response);
    if (!remoteAssignments.ok) {
      // console.error('[hydration] Remote assignments fetch failed:', remoteAssignments.error);
      return {
        ok: false,
        error: remoteAssignments.error.detail || 'Failed to fetch assignments',
      };
    }
    // console.log('[hydration] Remote assignments fetched:', {
    //   count: remoteAssignments.response.length,
    //   sampleZones: remoteAssignments.response.slice(0, 5).map(a => a.zone),
    // });
    return {
      ok: true,
      response: {
        document: remoteMetadata.response,
        assignments: remoteAssignments.response,
        updateLocal: true,
      },
    };
  }

  // Local is up to date, use it
  const localUpToDate = localTimestamp.toISOString() === remoteTimestamp.toISOString();
  if (!localUpToDate) {
    // console.warn('[hydration] Conflict detected', {
    //   local: localTimestamp.toISOString(),
    //   remote: remoteTimestamp.toISOString(),
    // });
    return {
      ok: false,
      error: `Cloud Save Conflict: This document was updated at ${remoteTimestamp} and your last updates are from ${localTimestamp}.`,
      response: {
        localDocument: idbDocument.document_metadata,
        localLastUpdated: localTimestamp.toISOString(),
        serverDocument: remoteMetadata.response,
        serverLastUpdated: remoteTimestamp.toISOString(),
      },
    };
  }
  const clientHasNoEdits =
    idbDocument.clientLastUpdated === idbDocument.document_metadata.updated_at;
  const priorityDocument = clientHasNoEdits
    ? remoteMetadata.response
    : idbDocument.document_metadata;
  const subordinateDocument = clientHasNoEdits
    ? idbDocument.document_metadata
    : remoteMetadata.response;
  // console.log('[hydration] Using local IDB data', {
  //   clientHasNoEdits,
  //   idbAssignmentCount: idbDocument.assignments.length,
  //   map_type: remoteMetadata.response.map_type,
  //   community_metadata_list_count: remoteMetadata.response.community_metadata_list?.length ?? 0,
  // });
  return {
    ok: true,
    response: {
      document: {
        // in case of missing fields or moderation overwrites
        ...subordinateDocument,
        ...priorityDocument,
        // always override with remote
        overlays: remoteMetadata.response.overlays,
        statefps: remoteMetadata.response.statefps,
      },
      assignments: idbDocument.assignments,
      hasLocalEdits: !clientHasNoEdits,
    },
  };
};
