import {NullableZone} from '../constants/types';

export type DistrictrMapOptions = {
  showBrokenDistricts?: boolean;
  higlightUnassigned?: boolean;
  lockPaintedAreas: boolean | Array<NullableZone>;
  mode: 'default' | 'break';
  paintByCounty?: boolean
};
