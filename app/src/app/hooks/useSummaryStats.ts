'use client';
import {demographyCache} from '@utils/demography/demographyCache';
import {useDemographyStore} from '../store/demography/demographyStore';
import { useMapStore } from '../store/mapStore';
import { useChartStore } from '../store/chartStore';

/**
 * Custom hook to retrieve summary statistics and zone statistics from the demography cache.
 *
 * @returns {Object} An object containing summary statistics and zone statistics.
 * @returns {Object} return.summaryStats - The summary statistics from the demography cache.
 * @returns {Object} return.zoneStats - The zone statistics from the demography cache.
 */
export const useSummaryStats = () => {
  // this triggers rendders on updates
  const __demogHash = useDemographyStore(state => state.dataHash);
  const __chartHash = useChartStore(state => state.dataUpdateHash);
  const mapDocument = useMapStore(state => state.mapDocument);
  const demoIsLoaded = mapDocument?.document_id && __demogHash.includes(mapDocument.document_id)
  
  return {
    summaryStats: demographyCache.summaryStats,
    zoneStats: demographyCache.zoneStats,
    zoneData: demographyCache.populations,
    demoIsLoaded
  };
};
