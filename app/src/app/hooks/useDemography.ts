'use client';
import {useMapStore} from '@store/mapStore';
import {useChartStore} from '@store/chartStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useMemo} from 'react';
import {demographyService} from '@/app/utils/demography/demographyService';
import {useDemographyStore} from '../store/demography/demographyStore';
import {FALLBACK_NUM_DISTRICTS} from '../constants/map/layerStyle';
import {FALLBACK_NUM_COMMUNITIES} from '../constants/map/mapDefaults';
import {SummaryRecord} from '../utils/api/summaryStats';
import {compareCoiZonesByRenderOrder, sortCommunitiesByRenderOrder} from '../utils/communities';

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
  const communities = useMapStore(state => state.communities);
  const numZones = mapMode === 'coi' ? numCommunities : numDistricts;
  const mapDocument = useMapStore(state => state.mapDocument);
  const demoIsLoaded = mapDocument?.document_id && demogHash.includes(mapDocument.document_id);
  // TODO: Could be refactored in the main demographyService class
  const populationData = useMemo(() => {
    let cleanedData = structuredClone(demographyService.populations).filter(row =>
      includeUnassigned ? true : Boolean(row.zone)
    );
    const orderedCommunities = sortCommunitiesByRenderOrder(communities);
    const expectedZones =
      mapMode === 'coi'
        ? orderedCommunities.map(community => community.id)
        : Array.from({length: numZones}, (_, index) => index + 1);
    const zonesPresent = new Set(cleanedData.map(row => row.zone).filter(Boolean));
    if (zonesPresent.size < expectedZones.length) {
      for (const zone of expectedZones) {
        if (!zonesPresent.has(zone)) {
          cleanedData.push({zone, total_pop_20: 0} as unknown as SummaryRecord);
        }
      }
    }
    Object.entries(paintedChanges).forEach(([zone, pop]) => {
      const index = cleanedData.findIndex(row => row.zone === parseInt(zone));
      if (index !== -1) {
        cleanedData[index].total_pop_20 += pop;
      }
    });

    return cleanedData.sort((left, right) => {
      if (left.zone === undefined || left.zone === null) return 1;
      if (right.zone === undefined || right.zone === null) return -1;
      if (mapMode === 'coi') {
        return compareCoiZonesByRenderOrder(left.zone, right.zone, orderedCommunities);
      }
      return left.zone - right.zone;
    });
  }, [
    chartHash,
    communities,
    demogHash,
    includeUnassigned,
    mapDocument,
    mapMode,
    numZones,
    paintedChanges,
  ]);

  return {
    populationData,
    demoIsLoaded,
  };
};
