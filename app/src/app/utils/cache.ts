import {DistrictrMap, Assignment} from '@utils/api/apiHandlers';
import {openDB, IDBPDatabase} from 'idb';
import { MapStore } from '@store/mapStore';

const stringifyWithMapsAndSets = (obj: object) => {
  return JSON.stringify(obj, (key, value) => {
    if (value instanceof Map) {
      return {__type: 'Map', value: Array.from(value.entries())};
    } else if (value instanceof Set) {
      return {__type: 'Set', value: Array.from(value.values())};
    }
    return value;
  });
};

export const parseWithMapsAndSets = (json: string) => {
  return JSON.parse(json, (key, value) => {
    if (value && value.__type === 'Map') {
      return new Map(value.value);
    } else if (value && value.__type === 'Set') {
      return new Set(value.value);
    }
    return value;
  });
};

class DistrictrIdbCache {
  db: IDBPDatabase | undefined = undefined;
  constructor() {
    this.init();
  }
  async init() {
    if (!this.db) {
      this.db = await openDB('districtr', 1.1, {
        upgrade(db) {
          db.createObjectStore('mapViews');
          db.createObjectStore('map_states');
        },
      });
    }
    return this.db!;
  }
  async cacheAssignments(document_id: string, updated_at: string, assignments: {
    zoneAssignments: MapStore['zoneAssignments'],
    shatterIds: MapStore['shatterIds'],
    shatterMappings: MapStore['shatterMappings'],
  }) {
    const t0 = performance.now();
    const db  = await this.init();
    const tx = db.transaction('map_states', 'readwrite');
    await Promise.all([
      tx.store.put(updated_at, `${document_id}_updated_at`),
      tx.store.put(stringifyWithMapsAndSets(assignments), `${document_id}_state`),
      tx.done,
    ]);
    console.log("cached assignments in", performance.now() - t0, "ms");
  }

  async getCachedAssignments(document_id: string) {
    const t0 = performance.now();
    const db  = await this.init();
    const [updated_at, state] = await Promise.all([
      db.get('map_states', `${document_id}_updated_at`),
      db.get('map_states', `${document_id}_state`),
    ]);
    if (updated_at && state) {
      console.log("fetched assignments in", performance.now() - t0, "ms");
      return {
        updated_at,
        state
      };
    }
  }

  cacheViews = async (views: DistrictrMap[]) => {
    const db  = await this.init();
    await db.put('mapViews', JSON.stringify(views), 'views');
  };
  getCachedViews = async () => {
    const db  = await this.init();
    const views = await db.get('mapViews', 'views');
    if (views) {
      return JSON.parse(views) as DistrictrMap[];
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

export const districtrLocalStorageCache = typeof window === 'undefined' ? {} : new DistrictrLocalStorageCache();
