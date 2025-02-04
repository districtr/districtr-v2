import {DistrictrMap, LocalAssignmentsResponse} from '@utils/api/apiHandlers';
import {openDB, IDBPDatabase, DBSchema} from 'idb';
import {NullableZone} from '../constants/types';
interface DistrictrIDB extends DBSchema {
  lastUpdated: {
    key: string;
    value: string;
  };
  shatterIds: {
    key: string;
    value: Record<'children' | 'parents', Set<string>>;
  };
  shatterMappings: {
    key: string;
    value: Record<string, Set<string>>;
  };
  assignments: {
    key: string;
    value: Map<string, NullableZone>;
  };
  mapViews: {
    value: DistrictrMap[];
    key: 'views';
  };
}
class DistrictrIdbCache {
  db: IDBPDatabase<DistrictrIDB> | undefined = undefined;
  constructor() {
    this.init();
  }
  async init() {
    if (!this.db) {
      this.db = await openDB<DistrictrIDB>('districtr', 1.41, {
        upgrade(db) {
          db.createObjectStore('mapViews');
          db.createObjectStore('shatterIds');
          db.createObjectStore('shatterMappings');
          db.createObjectStore('lastUpdated');
          db.createObjectStore('assignments');
        },
      });
    }
    return this.db!;
  }
  async cacheAssignments(
    document_id: string,
    updated_at: string,
    state: LocalAssignmentsResponse['data']
  ) {
    const db = await this.init();
    const lastUpdatedTx = db.transaction('lastUpdated', 'readwrite');
    const lastUpdatedStore = lastUpdatedTx.objectStore('lastUpdated');
    const shatterIdsTx = db.transaction('shatterIds', 'readwrite');
    const shatterIdsStore = shatterIdsTx.objectStore('shatterIds');
    const shatterMappingsTx = db.transaction('shatterMappings', 'readwrite');
    const shatterMappingsStore = shatterMappingsTx.objectStore('shatterMappings');
    const assignmentTx = db.transaction('assignments', 'readwrite');
    const assignmentStore = assignmentTx.objectStore(`assignments`);
    await Promise.all([
      lastUpdatedStore.put(updated_at, document_id),
      shatterIdsStore.put(state.shatterIds, document_id),
      shatterMappingsStore.put(state.shatterMappings, document_id),
      assignmentStore.put(state.zoneAssignments, document_id),
      lastUpdatedTx.done,
      shatterIdsTx.done,
      shatterMappingsTx.done,
      assignmentTx.done,
    ]);
  }

  async getCachedAssignments(document_id: string, lastUpdatedServer: string) {
    const db = await this.init();
    const lastUpdatedLocal = await db.get('lastUpdated', document_id);
    if (
      !lastUpdatedLocal ||
      !lastUpdatedServer ||
      new Date(lastUpdatedServer).toISOString() > new Date(lastUpdatedLocal).toISOString()
    ) {
      return false;
    }
    const [zoneAssignments, shatterIds, shatterMappings] = await Promise.all([
      db.get('assignments', document_id),
      db.get('shatterIds', document_id),
      db.get('shatterMappings', document_id),
    ]);
    if (!zoneAssignments || !shatterIds || !shatterMappings) return false;
    return {
      zoneAssignments,
      shatterIds,
      shatterMappings,
    };
  }

  cacheViews = async (views: DistrictrMap[]) => {
    const db = await this.init();
    await db.put('mapViews', views, 'views');
  };
  getCachedViews = async () => {
    const db = await this.init();
    const views = await db.get('mapViews', 'views');
    if (views) {
      return views as DistrictrMap[];
    }
  };
}

export const districtrIdbCache = new DistrictrIdbCache();
