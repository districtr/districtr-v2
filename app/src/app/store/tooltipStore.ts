import {TooltipState} from '@utils/map/types';
import {KeyOfSummaryStatConfig} from '../utils/api/summaryStats';
import {createWithDevWrapperAndSubscribe} from './middlewares';

export interface ZoneDescriptionTooltipState {
  zone: number;
  x: number;
  y: number;
}

export interface TooltipStore {
  tooltip: TooltipState | null;
  setTooltip: (menu: TooltipState | null) => void;
  inspectorMode: KeyOfSummaryStatConfig;
  setInspectorMode: (mode: KeyOfSummaryStatConfig) => void;
  inspectorFormat: 'percent' | 'standard';
  setInspectorFormat: (format: 'percent' | 'standard') => void;
  activeColumns: string[];
  setActiveColumns: (columns: string[]) => void;
  zoneDescriptionTooltip: ZoneDescriptionTooltipState | null;
  setZoneDescriptionTooltip: (tooltip: ZoneDescriptionTooltipState | null) => void;
  zoneDescriptionModalZone: number | null;
  setZoneDescriptionModalZone: (zone: number | null) => void;
}

export const useTooltipStore = createWithDevWrapperAndSubscribe<TooltipStore>(
  'Districtr Tooltip Store'
)((set, get) => ({
  tooltip: null,
  setTooltip: tooltip => {
    const currentTooltip = get().tooltip;
    if (currentTooltip === tooltip) return;
    set({tooltip});
  },
  inspectorMode: 'VAP',
  setInspectorMode: mode => set({inspectorMode: mode}),
  inspectorFormat: 'standard',
  setInspectorFormat: format => set({inspectorFormat: format}),
  activeColumns: [],
  setActiveColumns: columns => set({activeColumns: columns}),
  zoneDescriptionTooltip: null,
  setZoneDescriptionTooltip: tooltip => set({zoneDescriptionTooltip: tooltip}),
  zoneDescriptionModalZone: null,
  setZoneDescriptionModalZone: zone => set({zoneDescriptionModalZone: zone}),
}));
