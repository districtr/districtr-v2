import {TooltipState} from '@utils/map/types';
import {SUMMARY_TYPES, type SummaryType} from '@constants/demography/summary';
import {NUMBER_FORMATS, type InspectorFormat} from '@constants/demography/format';
import {createWithDevWrapperAndSubscribe} from './middlewares';

export interface ZoneDescriptionTooltipState {
  zone: number;
  x: number;
  y: number;
}

export interface TooltipStore {
  tooltip: TooltipState | null;
  setTooltip: (menu: TooltipState | null) => void;
  inspectorMode: SummaryType;
  setInspectorMode: (mode: SummaryType) => void;
  inspectorFormat: InspectorFormat;
  setInspectorFormat: (format: InspectorFormat) => void;
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
  inspectorMode: SUMMARY_TYPES.VAP,
  setInspectorMode: mode => set({inspectorMode: mode}),
  inspectorFormat: NUMBER_FORMATS.STANDARD,
  setInspectorFormat: format => set({inspectorFormat: format}),
  activeColumns: [],
  setActiveColumns: columns => set({activeColumns: columns}),
  zoneDescriptionTooltip: null,
  setZoneDescriptionTooltip: tooltip => set({zoneDescriptionTooltip: tooltip}),
  zoneDescriptionModalZone: null,
  setZoneDescriptionModalZone: zone => set({zoneDescriptionModalZone: zone}),
}));
