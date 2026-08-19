import {get} from '../factory';

export interface CountyListItem {
  /** 5-char county FIPS (STATEFP + COUNTYFP) */
  geoid: string;
  name: string;
}

/** List counties for the given 2-digit state FIPS codes. */
export const getCounties = async (statefps: string[]): Promise<CountyListItem[]> => {
  const result = await get<CountyListItem[]>('counties')({queryParams: {statefps}});
  if (!result.ok) {
    throw new Error(result.error.detail);
  }
  return result.response;
};
