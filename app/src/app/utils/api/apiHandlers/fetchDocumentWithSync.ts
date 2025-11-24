import {DocumentObject, Assignment} from './types';
import {getDocument} from './getDocument';
import {idb, StoredDocument} from '@/app/utils/idb/idb';
import {getAssignments} from './getAssignments';

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

/**
 * Checks if a string is a UUID (document_id) or a numeric public_id
 */
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Fetches a document simultaneously from IDB and server, then determines
 * which version to use based on updated_at timestamps.
 *
 * @param mapId - The document ID to fetch (can be UUID document_id or numeric public_id)
 * @param onConflict - Callback when a sync conflict is detected. Should return the resolution choice.
 * @returns The document and assignments to use, along with the source
 */
export async function fetchDocumentWithSync(
  mapId: string,
  onConflict?: (conflict: SyncConflictInfo) => Promise<SyncConflictResolution>
): Promise<DocumentFetchResult> {
  // If mapId is a public_id (numeric), we need to fetch from server first to get document_id
  // Otherwise, we can fetch simultaneously from IDB and server
  const isPublicId = !isUUID(mapId);

  let actualDocumentId: string | null = null;
  let serverDocResult: DocumentObject | null = null;

  if (isPublicId) {
    // For public_id, fetch from server first to get the actual document_id
    const serverResponse = await getDocument(mapId);
    if (!serverResponse.ok) {
      throw new Error(serverResponse.error.detail || 'Failed to fetch document from server');
    } else {
      serverDocResult = serverResponse.response;
      actualDocumentId = serverDocResult.document_id;
    }
  }

  // Now fetch simultaneously from IDB and server (if we haven't already)
  const idbPromise = actualDocumentId ? idb.getDocument(actualDocumentId) : idb.getDocument(mapId);
  const serverPromise = serverDocResult
    ? Promise.resolve({ok: true, response: serverDocResult} as const)
    : getDocument(mapId);

  const [localResult, serverResult] = await Promise.allSettled([idbPromise, serverPromise]);

  const localDoc = localResult.status === 'fulfilled' ? localResult.value : null;
  const finalServerDoc =
    serverDocResult ||
    (serverResult.status === 'fulfilled' && serverResult.value.ok
      ? serverResult.value.response
      : null);

  const documentIdForIdb = actualDocumentId || mapId;

  // If server fetch failed and no local copy, throw error
  if (!finalServerDoc && !localDoc) {
    if (serverResult.status === 'rejected') {
      throw new Error('Failed to fetch document from server');
    }
    if (serverResult.status === 'fulfilled' && !serverResult.value.ok) {
      throw new Error(serverResult.value.error.detail || 'Failed to fetch document from server');
    }
  }

  // If no local copy, use server and save to IDB
  if (!localDoc) {
    const assignments = await getAssignments(finalServerDoc!);
    if (!assignments.ok) {
      throw new Error(assignments.error.detail || 'Failed to fetch assignments from server');
    }
    // Save to IDB for future use
    await idb.updateDocument({
      id: documentIdForIdb,
      document_metadata: finalServerDoc!,
      assignments: assignments.response,
      clientLastUpdated: finalServerDoc!.updated_at || new Date().toISOString(),
    });
    return {
      document: finalServerDoc!,
      assignments: assignments.response,
      source: 'remote',
    };
  }

  // If server fetch failed but we have local, use local
  if (!finalServerDoc) {
    return {
      document: localDoc.document_metadata,
      assignments: localDoc.assignments || [],
      source: 'local',
    };
  }

  // Compare updated_at timestamps
  const localUpdatedAt = localDoc.document_metadata.updated_at;
  const serverUpdatedAt = finalServerDoc.updated_at;

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

  // If local document has been modified since last server sync, use local
  // This means local changes are newer than what we last synced from server
  if (localClientUpdated > lastKnownServerUpdate) {
    // Check if server is also newer - if so, it's a conflict
    if (serverDate > lastKnownServerUpdate) {
      const conflict: SyncConflictInfo = {
        localDocument: localDoc.document_metadata,
        localLastUpdated: localDoc.clientLastUpdated,
        serverDocument: finalServerDoc,
        serverLastUpdated: serverUpdatedAt!,
      };

      // If no conflict handler provided, default to using local (since local has changes)
      let resolution: SyncConflictResolution = 'use-local';
      if (onConflict) {
        resolution = await onConflict(conflict);
      }

      if (resolution === 'use-local') {
        // Use local version - return local, upload will be handled by caller
        return {
          document: localDoc.document_metadata,
          assignments: localDoc.assignments || [],
          source: 'local',
          conflictResolution: resolution,
        };
      } else if (resolution === 'use-server') {
        // Overwrite local with server
        const assignments = await getAssignments(finalServerDoc);
        if (!assignments.ok) {
          throw new Error(assignments.error.detail || 'Failed to fetch assignments from server');
        }
        // Update IDB with server version - set clientLastUpdated to match server's updated_at
        // to prevent conflict detection on next load
        await idb.updateDocument({
          id: documentIdForIdb,
          document_metadata: finalServerDoc,
          assignments: assignments.response,
          clientLastUpdated: serverUpdatedAt || new Date().toISOString(),
        });
        return {
          document: finalServerDoc,
          assignments: assignments.response,
          source: 'remote',
          conflictResolution: resolution,
        };
      } else if (resolution === 'fork') {
        // Fork: Create a copy of the local document and use that
        // The fork will be created by the caller, so we just return the local version
        // The caller should create a new document with copy_from_doc set to the current document_id
        return {
          document: localDoc.document_metadata,
          assignments: localDoc.assignments || [],
          source: 'local',
          conflictResolution: resolution,
        };
      } else {
        // keep-local - use local but update IDB to prevent conflict detection
        // Update the document's updated_at in IDB to match server's to prevent future conflicts
        const updatedLocalDoc = {
          ...localDoc.document_metadata,
          updated_at: serverUpdatedAt || localDoc.document_metadata.updated_at,
        };
        await idb.updateDocument({
          id: documentIdForIdb,
          document_metadata: updatedLocalDoc,
          assignments: localDoc.assignments || [],
          clientLastUpdated: new Date().toISOString(),
        });
        return {
          document: updatedLocalDoc,
          assignments: localDoc.assignments || [],
          source: 'local',
          conflictResolution: resolution,
        };
      }
    } else {
      // Local has been modified but server hasn't - use local
      return {
        document: localDoc.document_metadata,
        assignments: localDoc.assignments || [],
        source: 'local',
      };
    }
  }

  // If local hasn't been modified since last sync, check if server is newer
  // If server is newer AND local document hasn't been modified locally since last server sync
  // (i.e., the clientLastUpdated hasn't changed since we last synced with server)
  // This means: server updated_at changed, but we haven't made local changes
  if (serverDate > lastKnownServerUpdate) {
    const assignments = await getAssignments(finalServerDoc);
    if (!assignments.ok) {
      throw new Error(assignments.error.detail || 'Failed to fetch assignments from server');
    }
    // Update IDB with server version
    await idb.updateDocument({
      id: documentIdForIdb,
      document_metadata: finalServerDoc,
      assignments: assignments.response,
      clientLastUpdated: serverUpdatedAt || new Date().toISOString(),
    });
    return {
      document: finalServerDoc,
      assignments: assignments.response,
      source: 'remote',
    };
  }

  // If local is newer than server (or server hasn't been updated), use local
  if (localDate >= serverDate) {
    return {
      document: localDoc.document_metadata,
      assignments: localDoc.assignments || [],
      source: 'local',
    };
  }

  // Fallback: use server if it's newer (shouldn't reach here in normal flow)
  const assignments = await getAssignments(finalServerDoc);
  if (!assignments.ok) {
    throw new Error(assignments.error.detail || 'Failed to fetch assignments from server');
  }
  // Update IDB with server version
  await idb.updateDocument({
    id: documentIdForIdb,
    document_metadata: finalServerDoc,
    assignments: assignments.response,
    clientLastUpdated: serverUpdatedAt || new Date().toISOString(),
  });
  return {
    document: finalServerDoc,
    assignments: assignments.response,
    source: 'remote',
  };
}
