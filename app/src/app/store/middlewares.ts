import {persist, subscribeWithSelector} from 'zustand/middleware';
import {devToolsConfig, devwrapper, persistOptions, temporalConfig} from './middlewareConfig';
import {temporal} from 'zundo';
import {create, StateCreator} from 'zustand';
import {StateWithDevWrapperAndSubscribe, StateWithFullMiddleware} from './types';

export const createWithFullMiddlewares = <TState>(config: StateCreator<TState, [], [], TState>) => {
  return create(
    persist(
      devwrapper(
        temporal(
          subscribeWithSelector<StateCreator<TState, [], [], TState>>(config as any),
          temporalConfig
        ),
        {
          ...devToolsConfig,
          name: 'Districtr Map Store',
        }
      ),
      persistOptions
    )
  ) as StateWithFullMiddleware<TState>;
};

export const createWithDevWrapperAndSubscribe = <TState>(
  config: StateCreator<TState, [], [], TState>
) => {
  return create(
    devwrapper(subscribeWithSelector<TState>(config), {
      ...devToolsConfig,
      name: 'Districtr Map Store',
    })
  ) as StateWithDevWrapperAndSubscribe<TState>;
};
