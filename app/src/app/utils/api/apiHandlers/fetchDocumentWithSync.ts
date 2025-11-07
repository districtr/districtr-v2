import {DocumentObject, Assignment} from './types';
import {getDocument} from './getDocument';
import {idb, StoredDocument} from '@/app/utils/idb/idb';
import {getAssignments} from './getAssignments';

export type SyncConflictResolution = 'use-local' | 'use-server' | 'keep-local';

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

/**
 * Fetches a document simultaneously from IDB and server, then determines
 * which version to use based on updated_at timestamps.
 *
 * @param document_id - The document ID to fetch
 * @param onConflict - Callback when a sync conflict is detected. Should return the resolution choice.
 * @returns The document and assignments to use, along with the source
 */
export async function fetchDocumentWithSync(
  document_id: string,
  onConflict?: (conflict: SyncConflictInfo) => Promise<SyncConflictResolution>
): Promise<DocumentFetchResult> {
  // Fetch simultaneously from IDB and server
  const [localResult, serverResult] = await Promise.allSettled([
    idb.getDocument(document_id),
    getDocument(document_id),
  ]);

  const localDoc = localResult.status === 'fulfilled' ? localResult.value : null;
  const serverDocResult =
    serverResult.status === 'fulfilled' && serverResult.value.ok
      ? serverResult.value.response
      : null;

  // If server fetch failed and no local copy, throw error
  if (!serverDocResult && !localDoc) {
    if (serverResult.status === 'rejected') {
      throw new Error('Failed to fetch document from server');
    }
    if (serverResult.status === 'fulfilled' && !serverResult.value.ok) {
      throw new Error(serverResult.value.error.detail || 'Failed to fetch document from server');
    }
  }

  // If no local copy, use server
  if (!localDoc) {
    const assignments = await getAssignments(serverDocResult!);
    return {
      document: serverDocResult!,
      assignments: assignments.assignments,
      source: 'remote',
    };
  }

  // If server fetch failed but we have local, use local
  if (!serverDocResult) {
    return {
      document: localDoc.document_metadata,
      assignments: localDoc.assignments || [],
      source: 'local',
    };
  }

  // Compare updated_at timestamps
  const localUpdatedAt = localDoc.document_metadata.updated_at;
  const serverUpdatedAt = serverDocResult.updated_at;

  // If same updated_at, load from local
  if (localUpdatedAt === serverUpdatedAt) {
    return {
      document: localDoc.document_metadata,
      assignments: localDoc.assignments || [],
      source: 'local',
    };
  }

  // Parse dates for comparison
  const localDate = localUpdatedAt ? new Date(localUpdatedAt).getTime() : 0;
  const serverDate = serverUpdatedAt ? new Date(serverUpdatedAt).getTime() : 0;
  const localClientUpdated = new Date(localDoc.clientLastUpdated).getTime();

  // The last known server updated_at that was stored in IDB
  const lastKnownServerUpdate = localDoc.document_metadata.updated_at
    ? new Date(localDoc.document_metadata.updated_at).getTime()
    : 0;

  // If server is newer AND local document hasn't been modified locally since last server sync
  // (i.e., the clientLastUpdated hasn't changed since we last synced with server)
  // This means: server updated_at changed, but we haven't made local changes
  if (serverDate > lastKnownServerUpdate && localClientUpdated <= lastKnownServerUpdate) {
    const assignments = await getAssignments(serverDocResult);
    return {
      document: serverDocResult,
      assignments: assignments.assignments,
      source: 'remote',
    };
  }

  // Both have been updated - conflict detected
  // Server has been updated AND local has been updated (clientLastUpdated > lastKnownServerUpdate)
  if (serverDate > lastKnownServerUpdate && localClientUpdated > lastKnownServerUpdate) {
    const conflict: SyncConflictInfo = {
      localDocument: localDoc.document_metadata,
      localLastUpdated: localDoc.clientLastUpdated,
      serverDocument: serverDocResult,
      serverLastUpdated: serverUpdatedAt!,
    };

    // If no conflict handler provided, default to using server
    let resolution: SyncConflictResolution = 'use-server';
    if (onConflict) {
      resolution = await onConflict(conflict);
    }

    if (resolution === 'use-local') {
      // Use local version - overwrite server with local
      // Note: This currently uses local without uploading to server.
      // To fully implement "overwrite server with local", you would need to:
      // 1. Upload assignments to server via /api/assignments
      // 2. Update document metadata via /api/document/{document_id}/metadata
      return {
        document: localDoc.document_metadata,
        assignments: localDoc.assignments || [],
        source: 'local',
        conflictResolution: resolution,
      };
    } else if (resolution === 'use-server') {
      // Overwrite local with server
      const assignments = await getAssignments(serverDocResult);
      // Update IDB with server version
      await idb.updateDocument({
        id: document_id,
        document_metadata: serverDocResult,
        assignments: assignments.assignments,
        clientLastUpdated: new Date().toISOString(),
      });
      return {
        document: serverDocResult,
        assignments: assignments.assignments,
        source: 'remote',
        conflictResolution: resolution,
      };
    } else {
      // keep-local - same as use-local
      return {
        document: localDoc.document_metadata,
        assignments: localDoc.assignments || [],
        source: 'local',
        conflictResolution: resolution,
      };
    }
  }

  // Default: use server if it's newer
  if (serverDate > localDate) {
    const assignments = await getAssignments(serverDocResult);
    return {
      document: serverDocResult,
      assignments: assignments.assignments,
      source: 'remote',
    };
  }

  // Otherwise use local
  return {
    document: localDoc.document_metadata,
    assignments: localDoc.assignments || [],
    source: 'local',
  };
}
