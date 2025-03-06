'use client';
import {useMapStore} from '@store/mapStore';
import {useChartStore} from '@store/chartStore';
import {useMemo} from 'react';
import { demographyCache } from '@utils/demography/demographyCache';
import { SummaryRecord } from '../utils/demography/types';

/**
 * Custom hook to retrieve and process demography data.
 *
 * @param {boolean} [includeUnassigned] - Optional flag to include unassigned zones in the data.
 * @returns {object} An object containing the processed population data.
 *
 * @property {Array} populationData - The processed population data, sorted by zone.
 *
 * The hook performs the following operations:
 * - Retrieves the current state of the chart and map stores.
 * - Clones and filters the demography cache based on the `includeUnassigned` flag.
 * - Ensures that all zones up to the number of districts are present in the data.
 * - Applies any painted changes to the population data.
 * - Sorts the population data by zone.
 */
export const useDemography = (includeUnassigned?: boolean) => {
  const hash = useChartStore(state => state.dataUpdateHash);
  const paintedChanges = useChartStore(state => state.paintedChanges);
  const numDistricts = useMapStore(state => state.mapDocument?.num_districts ?? 4);
  const mapDocument = useMapStore(state => state.mapDocument);

  // TODO: Could be refactored in the main demographyCache class
  const populationData = useMemo(() => {
    let cleanedData = structuredClone(demographyCache.populations).filter(row =>
      includeUnassigned ? true : Boolean(row.zone)
    );
    const zonesPresent = cleanedData.map(row => row.zone).filter(Boolean);
    if (zonesPresent.length < numDistricts) {
      for (let i = 1; i <= numDistricts; i++) {
        if (!zonesPresent.includes(i)) {
          cleanedData.push({zone: i, total_pop: 0} as SummaryRecord);
        }
      }
    }
    Object.entries(paintedChanges).forEach(([zone, pop]) => {
      const index = cleanedData.findIndex(row => row.zone === parseInt(zone));
      if (index !== -1) {
        cleanedData[index].total_pop += pop;
      }
    });

    return cleanedData.sort((a, b) => a.zone - b.zone);
  }, [hash, paintedChanges, includeUnassigned, mapDocument]);

  return {
    populationData,
  }
};