import {NullableZone} from '../constants/types';
import { AxiosError, AxiosResponse } from 'axios';

export type DistrictrMapOptions = {
  showBrokenDistricts?: boolean;
  higlightUnassigned?: boolean;
  lockPaintedAreas: boolean | Array<NullableZone>;
  mode: 'default' | 'break';
  showZoneNumbers?: boolean
  paintByCounty?: boolean;
  currentStateFp?: string;
  showPopulationTooltip?: boolean;
};

export type DistrictrChartOptions = {
  popTargetPopDeviation?: number;
  popTargetPopDeviationPct?: number;
  popShowPopNumbers: boolean;
  popShowDistrictNumbers: boolean;
  popBarScaleToCurrent: boolean;
  popShowTopBottomDeviation: boolean;
};

interface APIErrorResponse extends AxiosResponse {detail: string}

export interface APIError extends AxiosError {
  response: APIErrorResponse
}
