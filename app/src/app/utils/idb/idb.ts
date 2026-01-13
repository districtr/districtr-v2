import {Assignment, DocumentMetadata, DocumentObject} from '../api/apiHandlers/types';
import Dexie, {Table} from 'dexie';
import {NullableZone} from '@/app/constants/types';
import {formatAssignmentsFromState} from '../map/formatAssignments';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
// --- Main Document Entry ---
export interface StoredDocument {
  id: string; // UUID key
  document_metadata: DocumentObject;
  assignments: Assignment[];
  clientLastUpdated: string; // ISO date string
  password?: string | null;
  shouldFetchAssignments?: boolean;
}

// --- Dexie Setup ---
export class DocumentsDB extends Dexie {
  documents!: Table<StoredDocument, string>;

  constructor() {
    super('DocumentsDB');
    this.version(1).stores({
      documents: 'id, clientLastUpdated',
    });
    
    // Set up beforeunload handler to flush pending updates
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        // Attempt to flush pending updates on page unload
        // Note: We can't await here, but IndexedDB operations are usually fast enough
        // to complete before the page closes. Data loss is possible on rapid close.
        this.flushPendingUpdate().catch(() => {
          // Silently fail on unload - user is leaving anyway
        });
      });
    }
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

  async getAllDocumentObjects(): Promise<DocumentObject[]> {
    return await this.documents
      .toCollection()
      .toArray()
      .then(documents => documents.map(document => document.document_metadata));
  }

  // Debounce state for batching rapid updates
  private pendingUpdate: {
    mapDocument: DocumentObject;
    zoneAssignments: Map<string, NullableZone>;
    shatterIds: {parents: Set<string>; children: Set<string>};
    childToParent: Map<string, string>;
    clientLastUpdated: string;
    timeoutId: ReturnType<typeof setTimeout> | null;
  } | null = null;

  // Debounce delay in milliseconds (500ms = save after user pauses for half a second)
  private readonly DEBOUNCE_DELAY = 500;

  /**
   * Debounced version of updateIdbAssignments that batches rapid updates.
   * Saves to IDB after the user pauses painting for DEBOUNCE_DELAY ms.
   * Use flushPendingUpdate() to force immediate save.
   * 
   * @param immediate - If true, saves immediately without debouncing
   */
  updateIdbAssignments = (
    mapDocument: DocumentObject,
    zoneAssignments: Map<string, NullableZone>,
    clientLastUpdated: string = new Date().toISOString(),
    immediate: boolean = false
  ) => {
    if (!mapDocument) return;

    // Clear existing timeout if any
    if (this.pendingUpdate?.timeoutId) {
      clearTimeout(this.pendingUpdate.timeoutId);
      this.pendingUpdate.timeoutId = null;
    }

    // Store the latest parameters, capturing current state
    const {shatterIds, childToParent} = useAssignmentsStore.getState();
    
    // If immediate save requested, save synchronously without debouncing
    if (immediate) {
      const document_id = mapDocument?.document_id;
      if (!document_id) return;
      
      const assignmentsToSave = formatAssignmentsFromState(
        document_id,
        zoneAssignments,
        shatterIds,
        childToParent,
        'assignment'
      );
      
      // Fire and forget - don't set pending update
      this.updateDocument({
        id: document_id,
        document_metadata: mapDocument,
        assignments: assignmentsToSave,
        clientLastUpdated: clientLastUpdated,
      });
      return;
    }

    // Set new timeout to save after debounce delay
    const timeoutId = setTimeout(() => {
      this.flushPendingUpdate();
    }, this.DEBOUNCE_DELAY);

    this.pendingUpdate = {
      mapDocument,
      zoneAssignments: new Map(zoneAssignments), // Clone to capture current state
      shatterIds: {
        parents: new Set(shatterIds.parents),
        children: new Set(shatterIds.children),
      },
      childToParent: new Map(childToParent),
      clientLastUpdated,
      timeoutId,
    };
  };

  /**
   * Immediately saves any pending update to IDB.
   * Useful for critical saves (e.g., before navigation, on explicit save).
   */
  flushPendingUpdate = async () => {
    if (!this.pendingUpdate) return;

    const {mapDocument, zoneAssignments, shatterIds, childToParent, clientLastUpdated} =
      this.pendingUpdate;

    // Clear the pending update
    if (this.pendingUpdate.timeoutId) {
      clearTimeout(this.pendingUpdate.timeoutId);
    }
    this.pendingUpdate = null;

    // Perform the actual save using captured state
    const document_id = mapDocument?.document_id;
    if (!mapDocument || !document_id) return;

    const assignmentsToSave = formatAssignmentsFromState(
      document_id,
      zoneAssignments,
      shatterIds,
      childToParent,
      'assignment'
    );

    await this.updateDocument({
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
        },
      },
      assignments: currDocument.assignments,
      clientLastUpdated: currDocument.clientLastUpdated,
    });
  };

  updateColorScheme = async (document_id: string, colorScheme: string[]) => {
    const currDocument = await this.getDocument(document_id);
    if (!currDocument) return;
    this.updateDocument({
      ...currDocument,
      document_metadata: {
        ...currDocument.document_metadata,
        color_scheme: colorScheme,
      },
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
