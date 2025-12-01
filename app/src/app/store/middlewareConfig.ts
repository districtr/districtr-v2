import {devtools, DevtoolsOptions, PersistOptions} from 'zustand/middleware';
import {MapStore} from './mapStore';
import {ZundoOptions} from 'zundo';

const prodWrapper: typeof devtools = (store: any) => store;
export const devwrapper = process.env.NODE_ENV === 'development' ? devtools : prodWrapper;

export const persistOptions: PersistOptions<MapStore, Partial<MapStore>> = {
  name: 'districtr-persistrictr',
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

export const temporalConfig: ZundoOptions<any, MapStore> = {
  // If diff returns null, not state is stored
  diff: (past: Partial<MapStore>, curr: Partial<MapStore>) => {
    // color changes included in undo/redo
    if (past.colorScheme !== curr.colorScheme) return past;
    // if not yet loaded, or is a temporal action (eg. silent heal) don't store
    if (past.mapRenderingState !== 'loaded' || curr.isTemporalAction) return null;
    return past;
  },
  limit: 20,
  // @ts-ignore: save only partial store
  partialize: state => {
    const {mapRenderingState, appLoadingState, colorScheme} = state;
    return {
      mapRenderingState,
      appLoadingState,
      colorScheme,
    } as Partial<MapStore>;
  },
};
