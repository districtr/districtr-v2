import { persist, subscribeWithSelector } from 'zustand/middleware';
import { devToolsConfig, devwrapper, persistOptions, temporalConfig } from './middlewareConfig';
import { temporal } from 'zundo';
import { create, StateCreator, StoreApi, UseBoundStore } from 'zustand';

export const createWithMiddlewares = <T>(config: StateCreator<T, [], [], T>) => {
  return create(
    persist(
      devwrapper(
        temporal(subscribeWithSelector<StateCreator<T, [], [], T>>(config), temporalConfig),
        {
          ...devToolsConfig,
          name: 'Districtr Map Store',
        }
      ),
      persistOptions
    )
  ) as UseBoundStore<StoreApi<T>>;
};