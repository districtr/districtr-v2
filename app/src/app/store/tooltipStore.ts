import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import {TooltipState} from '../utils/helpers';
import {devToolsConfig, devwrapper} from './middlewareConfig';

export interface TooltipStore {
  tooltip: TooltipState | null;
  setTooltip: (menu: TooltipState | null) => void;
}

export const useTooltipStore = create(
  devwrapper(
    subscribeWithSelector<TooltipStore>((set, get) => ({
      tooltip: null,
      setTooltip: tooltip => set({tooltip}),
    })),
    devToolsConfig
  )
);
