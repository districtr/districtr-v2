import {persist, subscribeWithSelector} from 'zustand/middleware';
import {devToolsConfig, devwrapper, persistOptions} from './middlewareConfig';
import {temporal} from 'zundo';
import {create, StateCreator} from 'zustand';
import { MapStore } from './mapStore';

const temporalOptions =  {
  diff: (pastState: Partial<MapStore>, currentState: Partial<MapStore>) => {
    if (!currentState.zoneAssignments || !pastState.zoneAssignments) return pastState;
    for (const geoid of currentState.zoneAssignments.keys()) {
      if (!pastState.zoneAssignments.has(geoid)) {
        pastState.zoneAssignments.set(geoid, null);
      }
    }
    return pastState as Partial<MapStore>;
  },
  // onSave: (paststate, currentState) => {
    
  // }
  equality: (pastState, currentState) => {
    return (
      pastState.zoneAssignments === currentState.zoneAssignments &&
      pastState.zoneAssignments.size === currentState.zoneAssignments.size &&
      (() => {
        const pastArray = Array.from(pastState.zoneAssignments.entries())
        const curr = currentState.zoneAssignments
        return pastArray.every(([k, v], i) => curr.get(k) === v)
      })()
    );
  },
  limit: 7,
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
