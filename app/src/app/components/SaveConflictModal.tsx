import React, {useEffect, useState} from 'react';
import {SyncConflictInfo} from '@/app/utils/api/apiHandlers/fetchDocument';
import {useMapStore} from '../store/mapStore';
import {useAssignmentsStore} from '../store/assignmentsStore';
import {DocumentObject} from '../utils/api/apiHandlers/types';
import {getDocument} from '../utils/api/apiHandlers/getDocument';
import {SyncConflictModal} from './SyncConflictModal';

export const SaveConflictModal: React.FC = ({}) => {
  const showSaveConflictModal = useAssignmentsStore(state => state.showSaveConflictModal);
  const localMapDocument = useMapStore(state => state.mapDocument);
  const localTimeUpdated = useAssignmentsStore(state => state.clientLastUpdated);
  const handlePutAssignmentsConflict = useAssignmentsStore(
    state => state.handlePutAssignmentsConflict
  );
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
