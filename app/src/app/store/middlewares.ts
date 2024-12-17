import {persist, subscribeWithSelector} from 'zustand/middleware';
import {devToolsConfig, devwrapper, persistOptions} from './middlewareConfig';
import {temporal, ZundoOptions} from 'zundo';
import {create, StateCreator} from 'zustand';
import { MapStore } from './mapStore';

const temporalOptions: ZundoOptions<any, MapStore> =  {
  // If diff returns null, not state is stored
  diff: (past: Partial<MapStore>, curr: Partial<MapStore>) => {
    // if not yet loaded, or is a temporal action (eg. silent heal) don't store
    if (past.mapRenderingState !== 'loaded' || curr.isTemporalAction) return null;
    const pastAssignments = past.zoneAssignments || new Map();
    const currAssignments = curr.zoneAssignments || new Map();
    // if assignments have changed size, do store the state
    if (pastAssignments.size !== currAssignments.size) return past
    for (const geoid of currAssignments.keys()) {
      if (pastAssignments.get(geoid) !== currAssignments.get(geoid)) {
        // if the same size, but one of the assignments has changed, store the state
        return past
      }
    }
    // Otherwise, if a state is recorded for some reason, but the shatterIds are the same size
    // don't store
    if (past.shatterIds?.parents.size === curr.shatterIds?.parents.size) return null;
    // if the shatterIds size have changed, store the state
    return past
  },
  limit: 20,
  // @ts-ignore: save only partial store
  partialize: state => {
    const {zoneAssignments, mapRenderingState, appLoadingState, shatterIds, shatterMappings} = state;
    return {zoneAssignments, mapRenderingState, appLoadingState, shatterIds, shatterMappings} as Partial<MapStore>;
  },
}

export const createWithMiddlewares = <T>(config: StateCreator<T>) => {
  return create(
    persist(
      devwrapper(temporal(subscribeWithSelector<T>(config), temporalOptions), {
        ...devToolsConfig,
        name: 'Districtr Map Store',
      }),
      // @ts-ignore
      persistOptions
    )
  );
};
