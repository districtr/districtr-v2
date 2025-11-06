import {Assignment, DocumentObject} from '../api/apiHandlers/types';
import Dexie, {Table} from 'dexie';

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
}

export const idb = new DocumentsDB();
