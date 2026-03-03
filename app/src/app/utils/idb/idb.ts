import {Assignment, DocumentMetadata, DocumentObject} from '../api/apiHandlers/types';
import Dexie, {Table} from 'dexie';
import {NullableZone} from '@/app/constants/types';
import {formatAssignmentsFromState} from '../map/formatAssignments';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {CoalitionGroupKey} from '../demography/coalition';
// --- Main Document Entry ---
export interface StoredDocument {
  id: string; // UUID key
  document_metadata: DocumentObject;
  assignments: Assignment[];
  clientLastUpdated: string; // ISO date string
  password?: string | null;
  shouldFetchAssignments?: boolean;
}

export interface CoalitionConfig {
  districtr_map_slug: string;
  selectedGroups: CoalitionGroupKey[];
  updatedAt: string;
}

// --- Dexie Setup ---
export class DocumentsDB extends Dexie {
  documents!: Table<StoredDocument, string>;
  coalition_configs!: Table<CoalitionConfig, string>;

  constructor() {
    super('DocumentsDB');
    this.version(1).stores({
      documents: 'id, clientLastUpdated',
    });
    this.version(2).stores({
      documents: 'id, clientLastUpdated',
      coalition_configs: 'districtr_map_slug, updatedAt',
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', e => {
        if (this.pendingUpdate) {
          // Block unload until save completes
          e.preventDefault();
          e.returnValue = '';
        }
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
  readonly DEBOUNCE_DELAY = 500;

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

  updateColorScheme = async (
    document_id: string,
    colorScheme: string[],
    clientLastUpdated?: string
  ) => {
    const currDocument = await this.getDocument(document_id);
    if (!currDocument) return;
    // Update clientLastUpdated to reflect local changes
    const newClientLastUpdated = clientLastUpdated || new Date().toISOString();
    this.updateDocument({
      ...currDocument,
      document_metadata: {
        ...currDocument.document_metadata,
        color_scheme: colorScheme,
      },
      clientLastUpdated: newClientLastUpdated,
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

  getCoalitionConfigBySlug = async (districtr_map_slug: string) => {
    if (!districtr_map_slug) return undefined;
    return await this.coalition_configs.get(districtr_map_slug);
  };

  upsertCoalitionConfigBySlug = async ({
    districtr_map_slug,
    selectedGroups,
  }: {
    districtr_map_slug: string;
    selectedGroups: CoalitionGroupKey[];
  }) => {
    if (!districtr_map_slug) return;
    await this.coalition_configs.put({
      districtr_map_slug,
      selectedGroups: [...selectedGroups],
      updatedAt: new Date().toISOString(),
    });
  };

  clearCoalitionConfigBySlug = async (districtr_map_slug: string) => {
    if (!districtr_map_slug) return;
    await this.coalition_configs.delete(districtr_map_slug);
  };

  /**
   * Update document_metadata (e.g. document_comments) and clientLastUpdated.
   * Use when comments or other metadata change locally without a server save.
   * The new clientLastUpdated indicates local changes exist.
   */
  updateIdbDocumentMetadata = async (
    document_metadata: DocumentObject,
    clientLastUpdated: string = new Date().toISOString()
  ) => {
    const document_id = document_metadata.document_id;
    const curr = await this.getDocument(document_id);
    if (!curr) return;

    await this.updateDocument({
      ...curr,
      document_metadata,
      clientLastUpdated,
    });
  };
}

export const idb = new DocumentsDB();
