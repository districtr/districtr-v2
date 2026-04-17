import React, {useEffect, useState} from 'react';
import {SyncConflictInfo} from '@/app/utils/api/apiHandlers/fetchDocument';
import {useMapStore} from '../store/mapStore';
import {useAssignmentsStore} from '../store/assignmentsStore';
import {useCoiAssignmentsStore} from '../store/coiAssignmentsStore';
import {useMapControlsStore} from '../store/mapControlsStore';
import {DocumentObject} from '../utils/api/apiHandlers/types';
import {getDocument} from '../utils/api/apiHandlers/getDocument';
import {SyncConflictModal} from './SyncConflictModal';
import {MAP_MODES} from '@constants/map/mode';
import {MAP_TYPES} from '@constants/document/types';

export const SaveConflictModal: React.FC = ({}) => {
  const showSaveConflictModal = useMapStore(state => state.showSaveConflictModal);
  const localMapDocument = useMapStore(state => state.mapDocument);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const isCommunity =
    localMapDocument?.map_type === MAP_TYPES.COMMUNITY || mapMode === MAP_MODES.COI;
  const districtLocalTimeUpdated = useAssignmentsStore(state => state.clientLastUpdated);
  const coiLocalTimeUpdated = useCoiAssignmentsStore(state => state.clientLastUpdated);
  const localTimeUpdated = isCommunity ? coiLocalTimeUpdated : districtLocalTimeUpdated;
  const districtConflictHandler = useAssignmentsStore(state => state.handlePutAssignmentsConflict);
  const coiConflictHandler = useCoiAssignmentsStore(state => state.handlePutAssignmentsConflict);
  const handlePutAssignmentsConflict = isCommunity ? coiConflictHandler : districtConflictHandler;
  const [serverMapDocument, setServerMapDocument] = useState<DocumentObject | null>(null);
  const serverTimeUpdated = serverMapDocument?.updated_at;

  useEffect(() => {
    if (!showSaveConflictModal) {
      setServerMapDocument(null);
      return;
    }
    const fetchServerMapDocument = async () => {
      const serverMapDocument = await getDocument(localMapDocument?.document_id);
      if (!serverMapDocument.ok) {
        setServerMapDocument(null);
        throw new Error(serverMapDocument.error.detail);
      } else {
        setServerMapDocument(serverMapDocument.response);
      }
    };
    fetchServerMapDocument();
  }, [showSaveConflictModal]);

  const conflict: SyncConflictInfo = {
    localDocument: localMapDocument!,
    localLastUpdated: localTimeUpdated,
    serverDocument: serverMapDocument!,
    serverLastUpdated: serverTimeUpdated!,
  };
  if (!showSaveConflictModal) return null;

  return (
    <SyncConflictModal
      open={showSaveConflictModal}
      conflict={conflict}
      onResolve={resolution => handlePutAssignmentsConflict(resolution, conflict)}
      loading={!serverMapDocument}
    />
  );
};
