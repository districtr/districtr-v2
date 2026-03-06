import {persist, PersistOptions, subscribeWithSelector} from 'zustand/middleware';
import {devToolsConfig, devwrapper, persistOptions, temporalConfig} from './middlewareConfig';
import {temporal, ZundoOptions} from 'zundo';
import {create, StateCreator} from 'zustand';
import {StateWithDevWrapperAndSubscribe, StateWithFullMiddleware} from './types';

export const createWithFullMiddlewares =
  <TState>(storeName: string) =>
  (config: StateCreator<TState, [], [], TState>) => {
    const temporalOptions = temporalConfig as unknown as ZundoOptions<TState, Partial<TState>>;
    const persistStoreOptions = persistOptions as unknown as PersistOptions<TState, Partial<TState>>;
    return create(
      persist(
        devwrapper(
          temporal(
            subscribeWithSelector<TState>(config),
            temporalOptions
          ),
          {
            ...devToolsConfig,
            name: storeName,
          }
        ),
        persistStoreOptions
      )
    ) as StateWithFullMiddleware<TState>;
  };

export const createWithDevWrapperAndSubscribe =
  <TState>(storeName: string) =>
  (config: StateCreator<TState, [], [], TState>) => {
    return create(
      devwrapper(subscribeWithSelector<TState>(config), {
        ...devToolsConfig,
        name: storeName,
      })
    ) as StateWithDevWrapperAndSubscribe<TState>;
  };
