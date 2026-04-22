import {Assignment, DocumentMetadata, DocumentObject} from '../api/apiHandlers/types';
import Dexie, {Table} from 'dexie';
import {NullableZone} from '@/app/constants/types';
import {formatAssignmentsFromState} from '../map/formatAssignments';
import {formatCoiAssignmentsFromState} from '../map/formatCoiAssignments';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {CoalitionGroupKey} from '../demography/coalition';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
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
          // Block unload until save completes, and try to flush synchronously. We
          // can't await here, but kicking the flush before the prompt at least
          // enqueues the IDB transaction so the browser has a chance to persist it
          // when the user confirms staying on the page.
          this.flushPendingUpdate();
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
  // Both the Zone and COI assignment updates can use the data format stores both a Zone/COI
  // id and a geoid.
  private pendingUpdate: {
    mapDocument: DocumentObject;
    assignments: Assignment[];
    clientLastUpdated: string;
    timeoutId: ReturnType<typeof setTimeout> | null;
  } | null = null;

  // Debounce delay in milliseconds (500ms = save after user pauses for half a second)
  readonly DEBOUNCE_DELAY = 500;

  /**
   * Queues an update to be saved to IDB with debouncing.
   *
   * If an update is already pending, it will be cleared and replaced with the new update.
   * If immediate is true, the update will be saved immediately without debouncing.
   *
   * @param mapDocument - The document metadata to save
   * @param assignments - The assignments to save
   * @param clientLastUpdated - Timestamp of the last update for conflict resolution
   * @param immediate - If true, saves immediately without debouncing
   */
  private queueAssignmentsUpdate = async (
    mapDocument: DocumentObject,
    assignments: Assignment[],
    clientLastUpdated: string,
    immediate: boolean
  ) => {
    const document_id = mapDocument?.document_id;
    if (!document_id) return;

    // If an unrelated document is already queued (e.g., user switched docs or
    // switched between district and COI mode), flush it first so the earlier
    // assignments aren't dropped.
    if (
      this.pendingUpdate &&
      this.pendingUpdate.mapDocument?.document_id !== document_id
    ) {
      await this.flushPendingUpdate();
    }

    if (this.pendingUpdate?.timeoutId) {
      clearTimeout(this.pendingUpdate.timeoutId);
    }
    this.pendingUpdate = null;

    if (immediate) {
      await this.updateDocument({
        id: document_id,
        document_metadata: mapDocument,
        assignments,
        clientLastUpdated,
      });
      return;
    }

    const timeoutId = setTimeout(() => {
      this.flushPendingUpdate();
    }, this.DEBOUNCE_DELAY);

    this.pendingUpdate = {
      mapDocument,
      assignments: assignments.map(assignment => ({...assignment})),
      clientLastUpdated,
      timeoutId,
    };
  };

  /**
   * Debounced version of updateIdbAssignments that batches rapid updates.
   *
   * Saves to IDB after the user pauses painting for DEBOUNCE_DELAY ms.
   * Use flushPendingUpdate() to force immediate save.
   *
   * @param mapDocument - The document metadata to save
   * @param zoneAssignments - The zone assignments to save
   * @param clientLastUpdated - Timestamp of the last update for conflict resolution
   * @param immediate - If true, saves immediately without debouncing
   */
  updateIdbAssignments = (
    mapDocument: DocumentObject,
    zoneAssignments: Map<string, NullableZone>,
    clientLastUpdated: string = new Date().toISOString(),
    immediate: boolean = false
  ) => {
    if (!mapDocument) return;
    const document_id = mapDocument?.document_id;
    if (!document_id) return;

    const {shatterIds, childToParent} = useAssignmentsStore.getState();
    const assignmentsToSave = formatAssignmentsFromState(
      document_id,
      zoneAssignments,
      shatterIds,
      childToParent,
      'assignment'
    );

    this.queueAssignmentsUpdate(mapDocument, assignmentsToSave, clientLastUpdated, immediate);
  };

  /**
   * Debounced version of updateIdbCoiAssignments that batches rapid updates.
   *
   * Saves to IDB after the user pauses painting for DEBOUNCE_DELAY ms.
   * Use flushPendingUpdate() to force immediate save.
   *
   * @param mapDocument - The document metadata to save
   * @param communityAssignments - The COI assignments to save
   * @param clientLastUpdated - Timestamp of the last update for conflict resolution
   * @param immediate - If true, saves immediately without debouncing
   */
  updateIdbCoiAssignments = (
    mapDocument: DocumentObject,
    communityAssignments: Map<number, Set<string>>,
    clientLastUpdated: string = new Date().toISOString(),
    immediate: boolean = false
  ) => {
    if (!mapDocument) return;
    const document_id = mapDocument?.document_id;
    const communitiesExist = (mapDocument?.community_metadata_list?.length ?? 0) > 0;
    if (!document_id || !communitiesExist) return;

    const {shatterIds, childToParent} = useCoiAssignmentsStore.getState();
    const assignmentsToSave = formatCoiAssignmentsFromState(
      document_id,
      communityAssignments,
      shatterIds,
      childToParent
    );

    this.queueAssignmentsUpdate(mapDocument, assignmentsToSave, clientLastUpdated, immediate);
  };

  /**
   * Immediately saves any pending update to IDB.
   * Useful for critical saves (e.g., before navigation, on explicit save).
   */
  flushPendingUpdate = async () => {
    if (!this.pendingUpdate) return;

    const {mapDocument, assignments, clientLastUpdated} = this.pendingUpdate;

    // Clear the pending update
    if (this.pendingUpdate.timeoutId) {
      clearTimeout(this.pendingUpdate.timeoutId);
    }
    this.pendingUpdate = null;

    // Perform the actual save using captured state
    const document_id = mapDocument?.document_id;
    if (!mapDocument || !document_id) return;

    await this.updateDocument({
      id: document_id,
      document_metadata: mapDocument,
      assignments,
      clientLastUpdated: clientLastUpdated,
    });
  };

  updateIdbMetadata = async (document_id: string, metadata: Partial<DocumentMetadata>) => {
    // Flush any pending debounced assignment write first. Otherwise the pending
    // write carries the pre-edit document_metadata and clobbers this change 500ms
    // later.
    await this.flushPendingUpdate();
    const currDocument = await this.getDocument(document_id);
    if (!currDocument) return;
    await this.updateDocument({
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
    await this.flushPendingUpdate();
    const currDocument = await this.getDocument(document_id);
    if (!currDocument) return;
    // Update clientLastUpdated to reflect local changes
    const newClientLastUpdated = clientLastUpdated || new Date().toISOString();
    await this.updateDocument({
      ...currDocument,
      document_metadata: {
        ...currDocument.document_metadata,
        color_scheme: colorScheme,
      },
      clientLastUpdated: newClientLastUpdated,
    });
  };

  updatePassword = async (document_id: string, password: string) => {
    await this.flushPendingUpdate();
    const currDocument = await this.getDocument(document_id);
    if (!currDocument) return;
    await this.updateDocument({
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
    // Flush any pending debounced assignment write first so the pending write
    // doesn't re-overlay the pre-edit document_metadata on top of this change.
    await this.flushPendingUpdate();
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
