import {useQuery} from '@tanstack/react-query';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useZonePopulations} from '@/app/hooks/useDemography';
import {useSummaryStats} from '@/app/hooks/useSummaryStats';
import {useMapSaveStatus} from '@/app/hooks/useMapSaveStatus';
import {useMapMetadata} from '@/app/hooks/useMapMetadata';
import {getContiguity} from '@utils/api/apiHandlers/getContiguity';
import {DRAFT_STATUSES, DRAFT_STATUS_ORDER, type DraftStatus} from '@constants/document/draftStatus';
import {FALLBACK_NUM_DISTRICTS} from '@constants/document/limits';
import {MAP_MODES} from '@constants/map/mode';
import {MAP_TYPES} from '@constants/document/types';

// A district counts as balanced within this share of the ideal population.
export const BALANCE_DEVIATION = 0.1;

/**
 * Live criteria for advancing a plan's draft status, shared by the helper box
 * and every status control so they agree on what's earned:
 * - scratch → in_progress: every district started and no unassigned population
 * - in_progress → ready_to_share: every district within 10% of ideal and contiguous
 *
 * Forward moves are gated on criteria (cumulatively); backward moves are always
 * allowed, as are community maps (no district criteria to measure).
 */
export function useDraftStatusCriteria() {
  const mapDocument = useMapStore(state => state.mapDocument);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const isEditing = useMapControlsStore(state => state.isEditing);
  const mapMetadata = useMapMetadata();
  const {populationData} = useZonePopulations();
  const {summaryStats} = useSummaryStats();
  const {isOutdated} = useMapSaveStatus();

  const isCommunity = mapDocument?.map_type === MAP_TYPES.COMMUNITY || mapMode === MAP_MODES.COI;
  const numDistricts = mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS;
  const idealPopulation = summaryStats?.idealpop;
  const unassigned = summaryStats?.unassigned;

  // Same query key as the map-validation Contiguity panel, so the two share a
  // cache entry; keying on updated_at refetches contiguity on each save.
  const {data: contiguityData} = useQuery({
    queryKey: ['Contiguity', mapDocument?.document_id, mapDocument?.updated_at],
    queryFn: async () => await getContiguity(mapDocument),
    enabled: !!mapDocument?.document_id && isEditing && !isCommunity,
    staleTime: 0,
    retry: false,
    placeholderData: previousData => previousData,
    refetchOnWindowFocus: false,
  });

  const paintedZones = populationData.filter(d => (d.total_pop_20 ?? 0) > 0).length;
  const contiguousZones =
    contiguityData?.ok === true
      ? Object.values(contiguityData.response).filter(pieces => pieces === 1).length
      : 0;
  const anyDiscontiguous =
    contiguityData?.ok === true &&
    Object.values(contiguityData.response).some(pieces => pieces > 1);
  // Contiguity isn't computable for every map (e.g. uploaded LOCAL layers);
  // an erroring endpoint must not lock advancement forever.
  const contiguityUnavailable = contiguityData?.ok === false;

  // Unstarted districts count as 100% deviation, so balance implies started.
  const maxDeviation =
    idealPopulation && populationData.length
      ? Math.max(...populationData.map(d => Math.abs((d.total_pop_20 ?? 0) - idealPopulation))) /
        idealPopulation
      : undefined;
  const balanced = maxDeviation !== undefined && maxDeviation <= BALANCE_DEVIATION;

  const scratchDone = paintedZones >= numDistricts && unassigned === 0;
  const inProgressDone =
    balanced && (contiguityUnavailable || contiguousZones >= numDistricts);

  const currentStatus: DraftStatus = mapMetadata?.draft_status ?? DRAFT_STATUSES.SCRATCH;
  const currentIndex = DRAFT_STATUS_ORDER.indexOf(currentStatus);

  /** True when the status can't be selected: a forward move whose (cumulative)
   * criteria aren't met. Current and backward statuses are never locked. */
  const statusLocked = (status: DraftStatus): boolean => {
    if (isCommunity) return false;
    if (DRAFT_STATUS_ORDER.indexOf(status) <= currentIndex) return false;
    if (status === DRAFT_STATUSES.IN_PROGRESS) return !scratchDone;
    if (status === DRAFT_STATUSES.READY_TO_SHARE) return !(scratchDone && inProgressDone);
    return false;
  };

  return {
    currentStatus,
    scratchDone,
    inProgressDone,
    statusLocked,
    contiguityStale: isOutdated,
    contiguityUnavailable,
    anyDiscontiguous,
    counts: {
      paintedZones,
      numDistricts,
      unassigned,
      contiguousZones,
      maxDeviation,
      idealPopulation,
    },
  };
}
