import {DevtoolsOptions, PersistOptions} from 'zustand/middleware';
import {MapStore} from './mapStore';

export const persistOptions: PersistOptions<MapStore, Partial<MapStore>> = {
  name: 'districtr-persistrictr',
  version: 0,
  partialize: state => ({
    userMaps: state.userMaps,
  }),
};

export const devToolsConfig: DevtoolsOptions = {
  serialize: {
    options: {
      set: (setInStore: Set<unknown>) => Array.from(setInStore),
      map: (mapInStore: Map<string, unknown>) => {
        return Array.from(mapInStore.entries()).reduce((acc, [key, value]) => {
          acc[key] = value; // Convert Map to plain object
          return acc;
        }, {} as Record<string, unknown>);
      },
    },
  },
};
