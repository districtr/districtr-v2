import {DocumentObject, Assignment} from './types';
import {getDocument} from './getDocument';
import {idb} from '@/app/utils/idb/idb';
import {getAssignments} from './getAssignments';
import {isUUID} from '../../metadata/isUUID';

export type SyncConflictResolution = 'use-local' | 'use-server' | 'keep-local' | 'fork';

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
    idb.getDocument(document_id),
    getDocument(document_id),
  ]);

  if (!remoteMetadata.ok) {
    return {
      ok: false,
      error: remoteMetadata.error.detail || 'Failed to fetch document',
    };
  }

  // No local copy, or public document and remote has updates
  const remoteTimestamp = new Date(remoteMetadata.response.updated_at);
  const localTimestamp = new Date(
    idbDocument?.document_metadata.updated_at || '1970-01-01T00:00:00Z'
  );
  const remoteIsNewer = remoteTimestamp && remoteTimestamp > localTimestamp;
  if (!idbDocument || (isPublic && remoteIsNewer) || source === 'remote') {
    const remoteAssignments = await getAssignments(remoteMetadata.response);
    if (!remoteAssignments.ok) {
      return {
        ok: false,
        error: remoteAssignments.error.detail || 'Failed to fetch assignments',
      };
    }
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
  if (localUpToDate) {
    return {
      ok: true,
      response: {
        document: idbDocument.document_metadata,
        assignments: idbDocument.assignments,
      },
    };
  }

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
};
