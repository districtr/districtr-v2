import {DistrictrMap, Assignment} from '@utils/api/apiHandlers';
import {openDB, IDBPDatabase, DBSchema} from 'idb';
import {MapStore} from '@store/mapStore';
import {NullableZone} from '../constants/types';

type DocumentID = string;

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

type MapStoreCache = {
  zoneAssignments: MapStore['zoneAssignments'];
  shatterIds: MapStore['shatterIds'];
  shatterMappings: MapStore['shatterMappings'];
};
export const convertStateObjToObj = (state: MapStoreCache) => {
  return {
    zoneAssignments: Array.from(state.zoneAssignments.entries()),
    shatterIds: {
      children: Array.from(state.shatterIds.children),
      parents: Array.from(state.shatterIds.parents),
    },
    shatterMappings: Object.entries(state.shatterMappings).map(([key, value]) => [
      key,
      Array.from(value),
    ]),
  };
};

export const hydrateStateObjFromObj = (obj: any) => {
  return {
    zoneAssignments: new Map(obj.zoneAssignments),
    shatterIds: {
      children: new Set(obj.shatterIds.children),
      parents: new Set(obj.shatterIds.parents),
    },
    shatterMappings: Object.fromEntries(
      obj.shatterMappings.map(([key, value]: [string, string[]]) => [key, new Set(value)])
    ),
  } as MapStoreCache;
};

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
    state: {
      zoneAssignments: MapStore['zoneAssignments'];
      shatterIds: MapStore['shatterIds'];
      shatterMappings: MapStore['shatterMappings'];
    }
  ) {
    const t0 = performance.now();
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
    console.log('cached assignments in', performance.now() - t0, 'ms');
  }

  async getCachedAssignments(document_id: string, lastUpdatedServer: string) {
    const t0 = performance.now();
    const db = await this.init();
    const localLastUpdated = await db.get('lastUpdated', document_id);
    console.log('localLastUpdated', localLastUpdated, 'lastUpdatedServer', lastUpdatedServer, document_id);
    if (
      !localLastUpdated ||
      !lastUpdatedServer ||
      new Date(lastUpdatedServer).toISOString() > new Date(localLastUpdated).toISOString()
    )
      return false;

      const [
        zoneAssignments,
        shatterIds,
        shatterMappings,
      ] = await Promise.all([
        db.get('assignments', document_id),
        db.get('shatterIds', document_id),
        db.get('shatterMappings', document_id),
      ]);
      if (!zoneAssignments || !shatterIds || !shatterMappings) return false;
      console.log("Got cached assignments in", performance.now() - t0, 'ms');
      return {
        zoneAssignments,
        shatterIds,
        shatterMappings,
      }
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

type AssignmentCache = {
  assignments: Assignment[];
  lastUpdated: string;
};

class DistrictrLocalStorageCache {
  mapViews: DistrictrMap[] | undefined = undefined;

  constructor() {
    const cachedViews = localStorage.getItem('districtr-map-views');
    if (cachedViews) {
      this.mapViews = JSON.parse(cachedViews);
    }
  }

  getCacheAssignments(document_id: string) {
    const assignments = localStorage.getItem(`districtr-assignments-${document_id}`);
    if (assignments) {
      return JSON.parse(assignments) as AssignmentCache;
    }
  }

  cacheViews = async (views: DistrictrMap[]) => {
    this.mapViews = views;
    localStorage.setItem('districtr-map-views', JSON.stringify(views));
  };
}

export const districtrLocalStorageCache =
  typeof window === 'undefined' ? {} : new DistrictrLocalStorageCache();
