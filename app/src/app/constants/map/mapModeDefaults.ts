import type {MapOptions} from 'maplibre-gl';
import {BASEMAP_IDS} from '@/app/constants/map/layerStyle';
import type {DistrictrMapOptions} from '@/app/store/types';
import {MAP_MODES, type MapMode} from '@constants/map/mode';

export const MAP_MODE_DEFAULT_OPTIONS: Record<
  MapMode,
  Partial<MapOptions & DistrictrMapOptions>
> = {
  [MAP_MODES.DISTRICTS]: {
    basemap: BASEMAP_IDS.MINIMAL,
    showZoneNumbers: true,
  },
  [MAP_MODES.COI]: {
    basemap: BASEMAP_IDS.STREETS,
    showZoneNumbers: false,
  },
};
