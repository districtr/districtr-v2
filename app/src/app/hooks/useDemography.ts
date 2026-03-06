'use client';
import {useMapStore} from '@store/mapStore';
import {useChartStore} from '@store/chartStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useMemo} from 'react';
import {demographyCache} from '@utils/demography/demographyCache';
import {useDemographyStore} from '../store/demography/demographyStore';
import {FALLBACK_NUM_DISTRICTS} from '../constants/map/layerStyle';
import {FALLBACK_NUM_COMMUNITIES} from '../constants/map/mapDefaults';
import {SummaryRecord} from '../utils/api/summaryStats';

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
export const useZonePopulations = (includeUnassigned?: boolean) => {
  const demogHash = useDemographyStore(state => state.dataHash);
  const chartHash = useChartStore(state => state.dataUpdateHash);
  const paintedChanges = useChartStore(state => state.paintedChanges);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const numDistricts = useMapStore(
    state => state.mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS
  );
  const numCommunities = useMapStore(state => state.numCommunities ?? FALLBACK_NUM_COMMUNITIES);
  const numZones = mapMode === 'coi' ? numCommunities : numDistricts;
  const mapDocument = useMapStore(state => state.mapDocument);
  const demoIsLoaded = mapDocument?.document_id && demogHash.includes(mapDocument.document_id);
  // TODO: Could be refactored in the main demographyCache class
  const populationData = useMemo(() => {
    let cleanedData = structuredClone(demographyCache.populations).filter(row =>
      includeUnassigned ? true : Boolean(row.zone)
    );
    const zonesPresent = cleanedData.map(row => row.zone).filter(Boolean);
    if (zonesPresent.length < numZones) {
      for (let i = 1; i <= numZones; i++) {
        if (!zonesPresent.includes(i)) {
          cleanedData.push({zone: i, total_pop_20: 0} as unknown as SummaryRecord);
        }
      }
    }
    Object.entries(paintedChanges).forEach(([zone, pop]) => {
      const index = cleanedData.findIndex(row => row.zone === parseInt(zone));
      if (index !== -1) {
        cleanedData[index].total_pop_20 += pop;
      }
    });

    return cleanedData.sort((a, b) => a.zone - b.zone);
  }, [chartHash, demogHash, paintedChanges, includeUnassigned, mapDocument, numZones]);

  return {
    populationData,
    demoIsLoaded,
  };
};
