import {Assignment, DocumentObject} from '../api/apiHandlers/types';
import Dexie, {Table} from 'dexie';
import {useMapStore} from '@store/mapStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {NullableZone} from '@/app/constants/types';

// --- Main Document Entry ---
export interface StoredDocument {
  id: string; // UUID key
  document_metadata: DocumentObject;
  assignments: Assignment[];
  clientLastUpdated: string; // ISO date string
}

// --- Dexie Setup ---
export class DocumentsDB extends Dexie {
  documents!: Table<StoredDocument, string>;

  constructor() {
    super('DocumentsDB');
    this.version(1).stores({
      documents: 'id, clientLastUpdated',
    });
  }

  async updateDocument(document: StoredDocument) {
    await this.documents.put(document);
  }

  async getDocument(document_id: string) {
    return await this.documents.get(document_id);
  }

  async deleteDocument(document_id: string) {
    await this.documents.delete(document_id);
  }

  updateIdbAssignments = (
    mapDocument: DocumentObject,
    zoneAssignments: Map<string, NullableZone>
  ) => {
    // // locked during break or heal
    const {mapLock, appLoadingState} = useMapStore.getState();
    const {shatterMappings, shatterIds} = useAssignmentsStore.getState();
    const document_id = mapDocument?.document_id;
    if (!mapDocument) return;
    // ensure document_id hasn't changed
    if (mapLock) return;
    // map must be loaded
    if (appLoadingState !== 'loaded') return;
    // map must be in edit mode
    const assignmentsToSave: Assignment[] = [];
    for (const [geo_id, zone] of zoneAssignments.entries()) {
      let parent_path = null;
      if (shatterIds.children.has(geo_id)) {
        parent_path =
          Object.entries(shatterMappings).find(([_, children]) => children.has(geo_id))?.[0] ??
          null;
      }
      assignmentsToSave.push({
        document_id,
        geo_id,
        zone,
        parent_path,
      });
    }
    const clientUpdatedAt = new Date().toISOString();
    idb
      .updateDocument({
        id: document_id,
        document_metadata: mapDocument,
        assignments: assignmentsToSave,
        clientLastUpdated: clientUpdatedAt,
      })
      .then(r => {
        console.log('updated idb', r);
      })
      .catch(e => {
        console.error('error updating idb', e);
      });
  };
}

export const idb = new DocumentsDB();
