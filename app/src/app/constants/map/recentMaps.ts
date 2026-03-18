import type {MapMode} from '@/app/constants/map/mapModeDefaults';
import type {DraftStatus} from '@/app/utils/api/apiHandlers/types';

export type MapTab = 'districts' | 'community';
export const mapTabFromMode = (mode: MapMode): MapTab =>
  mode === 'coi' ? 'community' : 'districts';
export const routeForTab = (tab: MapTab) => (tab === 'community' ? 'coi' : 'map');

export const DRAFT_STATUS_LABELS: Record<DraftStatus, string> = {
  scratch: 'Scratch Work',
  in_progress: 'In Progress',
  ready_to_share: 'Ready to Share',
};

export const DRAFT_STATUS_COLORS: Record<DraftStatus, 'gray' | 'orange' | 'green'> = {
  scratch: 'gray',
  in_progress: 'orange',
  ready_to_share: 'green',
};
