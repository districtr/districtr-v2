import {useDemographyStore} from '@store/demography/demographyStore';
import {demographyService} from '@/app/utils/demography/demographyService';

/** True once demography has loaded and every unit sits in one county. */
export const useIsSingleCounty = (): boolean => {
  // Re-render when demography data (re)loads.
  const dataHash = useDemographyStore(state => state.dataHash);
  return !!dataHash && !demographyService.spansMultipleCounties();
};
