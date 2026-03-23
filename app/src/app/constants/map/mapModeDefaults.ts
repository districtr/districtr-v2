import type {MapOptions} from 'maplibre-gl';
import {BASEMAP_IDS} from '@/app/constants/map/layerStyle';
import type {DistrictrMapOptions} from '@/app/store/types';

export type MapMode = 'districts' | 'coi';

export const MAP_MODE_DEFAULT_OPTIONS: Record<
  MapMode,
  Partial<MapOptions & DistrictrMapOptions>
> = {
  districts: {
    basemap: BASEMAP_IDS.MINIMAL,
    showZoneNumbers: true,
  },
  coi: {
    basemap: BASEMAP_IDS.STREETS,
    showZoneNumbers: false,
  },
};
