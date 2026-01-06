import {devtools, DevtoolsOptions, PersistOptions} from 'zustand/middleware';
import {MapStore} from './mapStore';
import {ZundoOptions} from 'zundo';
import {AssignmentsStore} from './assignmentsStore';

const prodWrapper: typeof devtools = (store: any) => store;
export const devwrapper = process.env.NODE_ENV === 'development' ? devtools : prodWrapper;

export const persistOptions: PersistOptions<MapStore, Partial<MapStore>> = {
  name: 'districtr-persist-v2',
  version: 0,
  partialize: state => ({
    userID: state.userID,
  }),
};

export const devToolsConfig: DevtoolsOptions = {
  serialize: {
    options: {
      set: (setInStore: Set<unknown>) => Array.from(setInStore),
      map: (mapInStore: Map<string, unknown>) => {
        return Array.from(mapInStore.entries()).reduce(
          (acc, [key, value]) => {
            acc[key] = value; // Convert Map to plain object
            return acc;
          },
          {} as Record<string, unknown>
        );
      },
    },
  },
};

const MIN_DIFF_MS = 3000;

export const temporalConfig: ZundoOptions<any, AssignmentsStore> = {
  // If diff returns null, not state is stored
  diff: (past: Partial<AssignmentsStore>, curr: Partial<AssignmentsStore>) => {
    if (!past.clientLastUpdated || !curr.clientLastUpdated) return null;
    // if the client timestamp is the same, don't store
    if (past.clientLastUpdated === curr.clientLastUpdated) return null;
    // If not yet ingested, don't store
    if (past.clientLastUpdated === '' || curr.clientLastUpdated === '') return null;
    // If the difference is less than the minimum diff time, don't store
    if (
      new Date(curr.clientLastUpdated.toString()).getTime() -
        new Date(past.clientLastUpdated.toString()).getTime() <
      MIN_DIFF_MS
    )
      return null;
    return past;
  },
  limit: 20,
  // @ts-ignore: save only partial store
  partialize: state => {
    const {shatterIds, shatterMappings, zoneAssignments, clientLastUpdated} = state;
    return {
      shatterIds,
      shatterMappings,
      zoneAssignments,
      clientLastUpdated,
    } as Partial<AssignmentsStore>;
  },
};
