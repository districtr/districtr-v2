import {useMapStore} from '@/app/store/mapStore';
import {useIdbDocument} from '@/app/hooks/useIdbDocument';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {MAP_MODES} from '@constants/map/mode';
import {MAP_TYPES} from '@constants/document/types';

/**
 * Whether the current map has unsaved (browser-only) changes, plus the matching
 * save action and last-synced time. Shared by the cloud save indicator and the
 * view switcher (which saves pending changes before swapping to a read-only view).
 */
export function useMapSaveStatus() {
  const mapDocument = useMapStore(state => state.mapDocument);
  const documentFromIdb = useIdbDocument(mapDocument?.document_id);
  const districtSave = useAssignmentsStore(state => state.handlePutAssignments);
  const districtClientLastUpdated = useAssignmentsStore(state => state.clientLastUpdated);
  const coiSave = useCoiAssignmentsStore(state => state.handlePutAssignments);
  const coiClientLastUpdated = useCoiAssignmentsStore(state => state.clientLastUpdated);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const updated = useMapStore(state => Object.values(state.updated).some(Boolean));

  const isCommunity = mapDocument?.map_type === MAP_TYPES.COMMUNITY || mapMode === MAP_MODES.COI;
  const activeClientLastUpdated = isCommunity ? coiClientLastUpdated : districtClientLastUpdated;
  const assignmentsOutdated =
    (mapDocument?.updated_at != null &&
      activeClientLastUpdated !== '' &&
      activeClientLastUpdated !== mapDocument.updated_at) ||
    documentFromIdb?.clientLastUpdated !== documentFromIdb?.document_metadata.updated_at;

  return {
    isOutdated: updated || assignmentsOutdated,
    save: isCommunity ? coiSave : districtSave,
    lastSyncedAt: documentFromIdb?.document_metadata.updated_at,
  };
}
