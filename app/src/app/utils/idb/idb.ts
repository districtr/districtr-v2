import {Assignment, DocumentMetadata, DocumentObject} from '../api/apiHandlers/types';
import Dexie, {Table} from 'dexie';
import {useMapStore} from '@store/mapStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {NullableZone} from '@/app/constants/types';
import {formatAssignmentsFromState} from '../map/formatAssignments';
// --- Main Document Entry ---
export interface StoredDocument {
  id: string; // UUID key
  document_metadata: DocumentObject;
  assignments: Assignment[];
  clientLastUpdated: string; // ISO date string
  password?: string | null;
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

  async getAllDocuments(): Promise<StoredDocument[]> {
    return await this.documents.toArray();
  }

  updateIdbAssignments = (
    mapDocument: DocumentObject,
    zoneAssignments: Map<string, NullableZone>,
    clientLastUpdated: string = new Date().toISOString()
  ) => {
    const {shatterMappings, shatterIds} = useAssignmentsStore.getState();
    const document_id = mapDocument?.document_id;
    if (!mapDocument) return;
    // map must be loaded
    // map must be in edit mode
    const assignmentsToSave = formatAssignmentsFromState(
      document_id,
      zoneAssignments,
      shatterIds,
      shatterMappings
    );
    this.updateDocument({
      id: document_id,
      document_metadata: mapDocument,
      assignments: assignmentsToSave,
      clientLastUpdated: clientLastUpdated,
    });
  };

  updateIdbMetadata = async (document_id: string, metadata: Partial<DocumentMetadata>) => {
    const currDocument = await this.getDocument(document_id);
    if (!currDocument) return;
    this.updateDocument({
      id: document_id,
      document_metadata: {
        ...currDocument.document_metadata, 
        map_metadata: {
          ...(currDocument.document_metadata.map_metadata ?? {}),
          ...metadata,
        }
      },
      assignments: currDocument.assignments,
      clientLastUpdated: currDocument.clientLastUpdated,
    });
  };

  updatePassword = async (document_id: string, password: string) => {
    const currDocument = await this.getDocument(document_id);
    if (!currDocument) return;
    this.updateDocument({
      ...currDocument,
      password: password,
    });
  };
}

export const idb = new DocumentsDB();
