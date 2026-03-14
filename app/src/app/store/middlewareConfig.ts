import {devtools, DevtoolsOptions, PersistOptions} from 'zustand/middleware';
import {MapStore} from './mapStore';
import {MIN_DIFF_MS} from '../constants/configuration';

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

// Shared diff function for all temporal stores — only fires when clientLastUpdated changes
// and enough time has passed since the last snapshot.
export const temporalDiff = (
  past: {clientLastUpdated?: string},
  curr: {clientLastUpdated?: string}
) => {
  // If diff returns null, no state is stored
  if (!past.clientLastUpdated || !curr.clientLastUpdated) return null;
  // If the client timestamp is the same, don't store
  if (past.clientLastUpdated === curr.clientLastUpdated) return null;
  // If not yet ingested, don't store
  if (past.clientLastUpdated === '' || curr.clientLastUpdated === '') return null;
  // If the difference is less than the minimum diff time, don't store
  if (
    new Date(curr.clientLastUpdated).getTime() - new Date(past.clientLastUpdated).getTime() <
    MIN_DIFF_MS
  )
    return null;
  return past;
};
