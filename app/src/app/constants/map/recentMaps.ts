import type {MapMode} from '@constants/map/mapModeDefaults';

export type MapTab = 'districts' | 'community';
export const mapTabFromMode = (mode: MapMode): MapTab =>
  mode === 'coi' ? 'community' : 'districts';
export const routeForTab = (tab: MapTab) => (tab === 'community' ? 'coi' : 'map');
