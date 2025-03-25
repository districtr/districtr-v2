'use client';
import {useChartStore} from '@store/chartStore';
import {demographyCache} from '@utils/demography/demographyCache';
import {useDemographyStore} from '../store/demographyStore';

/**
 * Custom hook to retrieve summary statistics and zone statistics from the demography cache.
 *
 * @returns {Object} An object containing summary statistics and zone statistics.
 * @returns {Object} return.summaryStats - The summary statistics from the demography cache.
 * @returns {Object} return.zoneStats - The zone statistics from the demography cache.
 */
export const useSummaryStats = () => {
  // this triggers rendders on updates
  const __chartHash = useChartStore(state => state.dataUpdateHash);
  const __demogHash = useDemographyStore(state => state.dataHash);
  return {
    summaryStats: demographyCache.summaryStats,
    zoneStats: demographyCache.zoneStats,
  };
};
