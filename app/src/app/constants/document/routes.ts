import {MAP_MODES, type MapMode} from '@constants/map/mode';
import {MAP_TABS, type MapTab} from '@constants/document/tabs';
import {MAP_TYPES, type MapType} from '@constants/document/types';

export const MAP_ROUTES = {
  DISTRICTS: 'map',
  COI: 'coi',
} as const;
export type MapRoute = (typeof MAP_ROUTES)[keyof typeof MAP_ROUTES];

export const mapTabFromMode = (mode: MapMode): MapTab =>
  mode === MAP_MODES.COI ? MAP_TABS.COMMUNITY : MAP_TABS.DISTRICTS;
export const routeForTab = (tab: MapTab): MapRoute =>
  tab === MAP_TABS.COMMUNITY ? MAP_ROUTES.COI : MAP_ROUTES.DISTRICTS;
export const routeForType = (type: MapType): MapRoute =>
  type === MAP_TYPES.COMMUNITY ? MAP_ROUTES.COI : MAP_ROUTES.DISTRICTS;
export const routeForMode = (mode: MapMode): MapRoute =>
  mode === MAP_MODES.COI ? MAP_ROUTES.COI : MAP_ROUTES.DISTRICTS;
