import {persist, subscribeWithSelector} from 'zustand/middleware';
import {devToolsConfig, devwrapper, persistOptions} from './middlewareConfig';
import {temporal, ZundoOptions} from 'zundo';
import {create, StateCreator} from 'zustand';
import {StateWithDevWrapperAndSubscribe, StateWithFullMiddleware} from './types';

export const createWithFullMiddlewares =
  <TState>(storeName: string, zundoOptions: ZundoOptions<any, any>) =>
  (config: StateCreator<TState, [], [], TState>) => {
    return create(
      persist(
        devwrapper(
          temporal(
            subscribeWithSelector<StateCreator<TState, [], [], TState>>(config as any),
            zundoOptions
          ),
          {
            ...devToolsConfig,
            name: storeName,
          }
        ),
        persistOptions
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
