import {idb} from './idb';
import {DocumentObject} from '../api/apiHandlers/types';
import { useMapStore } from '@/app/store/mapStore';

interface LocalStoragePersistState {
  state: {
    userMaps?: Array<DocumentObject & {name?: string; map_module?: string}>;
    userID?: string;
  };
  version: number;
}

const OLD_STORAGE_KEY = 'districtr-persistrictr';
const ARCHIVE_STORAGE_KEY = '__archive_districtr_persist';

/**
 * Migrates user maps from localStorage to IndexedDB.
 * This migration:
 * 1. Checks for the old localStorage key 'districtr-persistrictr'
 * 2. Extracts userMaps from the stored state
 * 3. Migrates each map to IndexedDB
 * 4. Archives the localStorage entry by renaming it
 * 5. Verifies the archive succeeded and deletes the old key
 */
export async function migrateUserMapsFromLocalStorage(): Promise<void> {
  // Only run in browser environment
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    // If archive already exists, migration has already run
    if (localStorage.getItem(ARCHIVE_STORAGE_KEY)) {
      return;
    }
    // Check if the old localStorage key exists
    const oldStorageData = localStorage.getItem(OLD_STORAGE_KEY);
    if (!oldStorageData) {
      // No old data to migrate
      return;
    }

    // Parse the localStorage data
    let parsedData: LocalStoragePersistState;
    try {
      parsedData = JSON.parse(oldStorageData);
    } catch (error) {
      console.error('Failed to parse old localStorage data:', error);
      // If we can't parse it, archive it anyway and return
      localStorage.setItem(ARCHIVE_STORAGE_KEY, oldStorageData);
      localStorage.removeItem(OLD_STORAGE_KEY);
      return;
    }

    // Check if userMaps exists and has content
    const userMaps = parsedData?.state?.userMaps;
    if (!userMaps || !Array.isArray(userMaps) || userMaps.length === 0) {
      // No maps to migrate, but archive the data anyway
      localStorage.setItem(ARCHIVE_STORAGE_KEY, oldStorageData);
      localStorage.removeItem(OLD_STORAGE_KEY);
      return;
    }

    // Migrate each map to IndexedDB
    const migrationPromises = userMaps.map(async (map) => {
      try {
        // Determine the document ID - prefer document_id, fallback to uuid
        const documentId = map.document_id;
        if (!documentId) {
          console.warn('Skipping map without document_id or uuid:', map);
          return;
        }

        // Check if document already exists in IndexedDB
        const existingDoc = await idb.getDocument(documentId);
        
        // Only migrate if it doesn't already exist (to avoid overwriting newer data)
        if (!existingDoc) {
          // Create document metadata with old updated_at timestamp
          const migratedMetadata: DocumentObject = {
            ...(map as DocumentObject),
          };

          // Create StoredDocument structure with empty assignments
          // The old timestamp will flag fetchDocument to get assignments from the remote server
          await idb.updateDocument({
            id: documentId,
            document_metadata: migratedMetadata,
            assignments: [], // Explicitly empty - assignments will be fetched from server
            clientLastUpdated: new Date().toISOString(),
            shouldFetchAssignments: true,
          });
        }
      } catch (error) {
        console.error(`Failed to migrate map ${map.document_id}:`, error);
        // Continue with other maps even if one fails
      }
    });

    // Wait for all migrations to complete
    await Promise.all(migrationPromises);

    // Archive the localStorage data by renaming the key
    localStorage.setItem(ARCHIVE_STORAGE_KEY, oldStorageData);

    // Verify the archive succeeded
    const archivedData = localStorage.getItem(ARCHIVE_STORAGE_KEY);
    if (archivedData === oldStorageData) {
      // Archive succeeded, delete the old key
      localStorage.removeItem(OLD_STORAGE_KEY);
      window.location.reload();
    } else {
      console.error('Failed to verify localStorage archive - keeping old key');
    }
  } catch (error) {
    console.error('Error during user maps migration:', error);
    // Don't throw - migration failures shouldn't break the app
  }
  // reload
}
