import { Page } from '@playwright/test';

/**
 * Zustand Store Testing Utilities
 * 
 * Helpers for accessing and verifying Zustand store state in tests.
 * 
 * IMPORTANT: For these helpers to work, the application must expose stores
 * on the window object in development mode. Add this to your store files:
 * 
 * if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
 *   window.__ZUSTAND_STORES__ = window.__ZUSTAND_STORES__ || {};
 *   window.__ZUSTAND_STORES__.storeName = useStoreName;
 * }
 */

// Store type definitions for type safety in tests
export interface MapStoreState {
  appLoadingState: 'loaded' | 'initializing' | 'loading' | 'blurred';
  mapRenderingState: 'loaded' | 'initializing' | 'loading';
  mapDocument: {
    document_id: string;
    districtr_map_slug: string;
    num_districts: number;
    parent_layer: string;
    child_layer?: string;
    tiles_s3_path: string;
    extent: [number, number, number, number];
    access: 'edit' | 'view';
    map_metadata?: {
      name?: string;
      description?: string;
    };
  } | null;
  colorScheme: string[];
  captiveIds: Set<string>;
  focusFeatures: Array<{ id: string | number; source: string; sourceLayer: string }>;
}

export interface MapControlsStoreState {
  selectedZone: number;
  isPainting: boolean;
  isEditing: boolean;
  activeTool: 'pan' | 'brush' | 'eraser' | 'shatter' | 'inspector';
  brushSize: number;
  mapOptions: {
    showPopulationTooltip: boolean;
    showDemographicMap?: 'side-by-side' | 'overlay';
    lockPaintedAreas: (number | null)[];
    mode: 'default' | 'break';
    bounds?: [number, number, number, number];
  };
}

export interface AssignmentsStoreState {
  zoneAssignments: Map<string, number | null>;
  accumulatedAssignments: Map<string, number | null>;
  shatterIds: {
    parents: Set<string>;
    children: Set<string>;
  };
}

/**
 * Get the state of a Zustand store by name
 */
export async function getStoreState<T>(
  page: Page,
  storeName: 'mapStore' | 'mapControlsStore' | 'assignmentsStore' | 'tooltipStore' | 'chartStore'
): Promise<T | null> {
  return await page.evaluate((name) => {
    // @ts-ignore - accessing window globals
    const stores = window.__ZUSTAND_STORES__;
    if (!stores || !stores[name]) return null;
    
    const state = stores[name].getState();
    
    // Convert Map and Set to serializable objects
    return JSON.parse(JSON.stringify(state, (key, value) => {
      if (value instanceof Map) {
        return { __type: 'Map', entries: Array.from(value.entries()) };
      }
      if (value instanceof Set) {
        return { __type: 'Set', values: Array.from(value.values()) };
      }
      return value;
    }));
  }, storeName);
}

/**
 * Get map store state
 */
export async function getMapStoreState(page: Page): Promise<MapStoreState | null> {
  return await getStoreState<MapStoreState>(page, 'mapStore');
}

/**
 * Get map controls store state
 */
export async function getMapControlsState(page: Page): Promise<MapControlsStoreState | null> {
  return await getStoreState<MapControlsStoreState>(page, 'mapControlsStore');
}

/**
 * Get assignments store state
 */
export async function getAssignmentsState(page: Page): Promise<AssignmentsStoreState | null> {
  return await getStoreState<AssignmentsStoreState>(page, 'assignmentsStore');
}

/**
 * Check if stores are exposed on the window object
 */
export async function areStoresExposed(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    // @ts-ignore
    return typeof window.__ZUSTAND_STORES__ !== 'undefined';
  });
}

/**
 * Wait for a store to have a specific state
 */
export async function waitForStoreState<T>(
  page: Page,
  storeName: string,
  predicate: (state: T) => boolean,
  timeout = 10000
): Promise<void> {
  const predicateString = predicate.toString();
  
  await page.waitForFunction(
    ({ store, pred }) => {
      // @ts-ignore
      const stores = window.__ZUSTAND_STORES__;
      if (!stores || !stores[store]) return false;
      
      const state = stores[store].getState();
      // eslint-disable-next-line no-eval
      const predicateFn = eval(`(${pred})`);
      return predicateFn(state);
    },
    { store: storeName, pred: predicateString },
    { timeout }
  );
}

/**
 * Get the zone assignments as a plain object (Map converted to object)
 */
export async function getZoneAssignments(
  page: Page
): Promise<Record<string, number | null>> {
  return await page.evaluate(() => {
    // @ts-ignore
    const store = window.__ZUSTAND_STORES__?.assignmentsStore;
    if (!store) return {};
    
    const { zoneAssignments } = store.getState();
    const result: Record<string, number | null> = {};
    
    zoneAssignments.forEach((value: number | null, key: string) => {
      result[key] = value;
    });
    
    return result;
  });
}

/**
 * Get count of assignments per zone
 */
export async function getZoneAssignmentCounts(
  page: Page
): Promise<Record<number, number>> {
  return await page.evaluate(() => {
    // @ts-ignore
    const store = window.__ZUSTAND_STORES__?.assignmentsStore;
    if (!store) return {};
    
    const { zoneAssignments } = store.getState();
    const counts: Record<number, number> = {};
    
    zoneAssignments.forEach((zone: number | null) => {
      if (zone !== null) {
        counts[zone] = (counts[zone] || 0) + 1;
      }
    });
    
    return counts;
  });
}

/**
 * Get the number of features assigned to any zone
 */
export async function getTotalAssignedFeatures(page: Page): Promise<number> {
  return await page.evaluate(() => {
    // @ts-ignore
    const store = window.__ZUSTAND_STORES__?.assignmentsStore;
    if (!store) return 0;
    
    const { zoneAssignments } = store.getState();
    let count = 0;
    
    zoneAssignments.forEach((zone: number | null) => {
      if (zone !== null) count++;
    });
    
    return count;
  });
}

/**
 * Check if the map is in editing mode
 */
export async function isEditingMode(page: Page): Promise<boolean> {
  const state = await getMapControlsState(page);
  return state?.isEditing ?? false;
}

/**
 * Check if the map document has edit access
 */
export async function hasEditAccess(page: Page): Promise<boolean> {
  const state = await getMapStoreState(page);
  return state?.mapDocument?.access === 'edit';
}

/**
 * Get the current map document ID
 */
export async function getDocumentId(page: Page): Promise<string | null> {
  const state = await getMapStoreState(page);
  return state?.mapDocument?.document_id ?? null;
}

/**
 * Get the number of districts for the current map
 */
export async function getNumDistricts(page: Page): Promise<number | null> {
  const state = await getMapStoreState(page);
  return state?.mapDocument?.num_districts ?? null;
}

/**
 * Get the current color scheme
 */
export async function getColorScheme(page: Page): Promise<string[]> {
  const state = await getMapStoreState(page);
  return state?.colorScheme ?? [];
}
