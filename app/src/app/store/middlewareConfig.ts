import {devtools, DevtoolsOptions, PersistOptions} from 'zustand/middleware';
import {MapStore} from './mapStore';
import {ZundoOptions} from 'zundo';

const prodWrapper: typeof devtools = (store: any) => store;
export const devwrapper = process.env.NODE_ENV === 'development' ? devtools : prodWrapper;

export const persistOptions: PersistOptions<MapStore, Partial<MapStore>> = {
  name: 'districtr-persistrictr',
  version: 0,
  partialize: state => ({
    userMaps: state.userMaps,
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

export const temporalConfig: ZundoOptions<any, MapStore> = {
  // If diff returns null, not state is stored
  diff: (past: Partial<MapStore>, curr: Partial<MapStore>) => {
    // if not yet loaded, or is a temporal action (eg. silent heal) don't store
    if (past.mapRenderingState !== 'loaded' || curr.isTemporalAction) return null;
    // if current state has no zoneAssignments, don't store
    if (!past.zoneAssignments || !curr.zoneAssignments || curr.zoneAssignments?.size === 0)
      return null;
    // if assignments have changed size, do store the state
    if (past.zoneAssignments.size !== curr.zoneAssignments.size) return past;
    for (const geoid of curr.zoneAssignments.keys()) {
      if (past.zoneAssignments.get(geoid) !== curr.zoneAssignments.get(geoid)) {
        // if the same size, but one of the assignments has changed, store the state
        return past;
      }
    }
    // Otherwise, if a state is recorded for some reason, but the shatterIds are the same size
    // don't store
    if (past.shatterIds?.parents.size === curr.shatterIds?.parents.size) return null;
    // if the shatterIds size have changed, store the state
    return past;
  },
  limit: 20,
  // @ts-ignore: save only partial store
  partialize: state => {
    const {zoneAssignments, mapRenderingState, appLoadingState, shatterIds, shatterMappings} =
      state;
    return {
      zoneAssignments,
      mapRenderingState,
      appLoadingState,
      shatterIds,
      shatterMappings,
    } as Partial<MapStore>;
  },
};
