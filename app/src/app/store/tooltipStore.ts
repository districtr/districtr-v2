import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import {TooltipState} from '@utils/map/types';
import {devToolsConfig, devwrapper} from './middlewareConfig';
import {KeyOfSummaryStatConfig} from '../utils/api/summaryStats';

export interface TooltipStore {
  tooltip: TooltipState | null;
  setTooltip: (menu: TooltipState | null) => void;
  inspectorMode: KeyOfSummaryStatConfig;
  setInspectorMode: (mode: KeyOfSummaryStatConfig) => void;
  inspectorFormat: 'percent' | 'standard';
  setInspectorFormat: (format: 'percent' | 'standard') => void;
  activeColumns: string[];
  setActiveColumns: (columns: string[]) => void;
}

export const useTooltipStore = create(
  devwrapper(
    subscribeWithSelector<TooltipStore>((set, get) => ({
      tooltip: null,
      setTooltip: tooltip => set({tooltip}),
      inspectorMode: 'VAP',
      setInspectorMode: mode => set({inspectorMode: mode}),
      inspectorFormat: 'standard',
      setInspectorFormat: format => set({inspectorFormat: format}),
      activeColumns: [],
      setActiveColumns: columns => set({activeColumns: columns}),
    })),
    {
      ...devToolsConfig,
      name: 'Districtr Tooltip Store',
    }
  )
);
