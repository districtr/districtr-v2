import { persist, subscribeWithSelector } from 'zustand/middleware';
import { devToolsConfig, devwrapper, persistOptions, temporalConfig } from './middlewareConfig';
import { temporal } from 'zundo';
import { create, StateCreator } from 'zustand';
import { StateWithMiddleware } from './types';

export const createWithMiddlewares = <TState>(config: StateCreator<TState, [], [], TState>) => {
  return create(
    persist(
      devwrapper(
        temporal(subscribeWithSelector<StateCreator<TState, [], [], TState>>(config as any), temporalConfig),
        {
          ...devToolsConfig,
          name: 'Districtr Map Store',
        }
      ),
      persistOptions
    )
  ) as StateWithMiddleware<TState>
};