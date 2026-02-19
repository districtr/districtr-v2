'use client';
import React, {useEffect} from 'react';
import {MapContextMenu} from '@components/ContextMenu';
import {CoiMap} from '@components/Map/CoiMap';
import SidebarComponent from '@components/sidebar/Sidebar';
import {QueryClientProvider} from '@tanstack/react-query';
import {queryClient} from '@utils/api/queryClient';
import {ErrorNotification} from '@components/ErrorNotification';
import {DraggableToolbar} from '@components/Toolbar/Toolbar';
import {MapTooltip} from '@components/Map/Tooltip/MapTooltip';
import {MapLockShade} from '@components/MapLockShade';
import {Topbar} from '@/app/components/Topbar/Topbar';
import {Flex} from '@radix-ui/themes';
import {useMapStore} from '@store/mapStore';
import {initSubs} from '@store/subscriptions';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useDocumentWithSync} from '@/app/hooks/useDocumentWithSync';
import {SaveConflictModal} from '../SaveConflictModal';
import {migrateUserMapsFromLocalStorage} from '@/app/utils/idb/migrateUserMaps';

interface CoiMapPageProps {
  isEditing: boolean;
  documentId: string;
}

function ChildCoiMapPage({isEditing, documentId}: CoiMapPageProps) {
  const setIsEditing = useMapControlsStore(state => state.setIsEditing);
  const toolbarLocation = useToolbarStore(state => state.toolbarLocation);
  const setErrorNotification = useMapStore(state => state.setErrorNotification);
  const userID = useMapStore(state => state.userID);
  const setUserID = useMapStore(state => state.setUserID);
  const mapLock = useMapStore(state => state.mapLock);

  useEffect(() => {
    migrateUserMapsFromLocalStorage();
  }, []);

  const {
    isLoading: isLoadingDocument,
    error: documentError,
    conflictModal,
  } = useDocumentWithSync({
    document_id: documentId || undefined,
    enabled: !!documentId,
  });

  useEffect(() => {
    if (documentError && documentId) {
      setErrorNotification({
        message: `Failed to load document: ${documentError.message}`,
        id: `document-load-error-${documentId}`,
        severity: 1,
      });
    }
  }, [documentError, documentId, setErrorNotification]);

  useEffect(() => {
    setIsEditing(isEditing);
  }, [isEditing, setIsEditing]);

  useEffect(() => {
    !userID && setUserID();
  }, [userID, setUserID]);

  useEffect(() => {
    const unsub = initSubs();
    return () => {
      unsub();
    };
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden flex justify-between p flex-col-reverse lg:flex-row-reverse landscape:flex-row-reverse">
      <SidebarComponent />
      <div className={`h-full relative w-full flex-1 flex flex-col lg:h-screen landscape:h-screen`}>
        <Topbar />
        <Flex direction="row" height="100%">
          <CoiMap />
        </Flex>
        {toolbarLocation === 'map' && <DraggableToolbar />}
        {!!documentId && (
          <MapLockShade
            mapLock={mapLock}
            loadingState={{
              isLoadingDocument,
              isLoadingAssignments: isLoadingDocument,
              isFetchingDocument: isLoadingDocument,
              isFetchingAssignments: isLoadingDocument,
            }}
          />
        )}
        <MapTooltip />
      </div>
      <MapContextMenu />
      <ErrorNotification />
      {conflictModal}
      <SaveConflictModal />
    </div>
  );
}

export default function CoiMapPage({isEditing, documentId}: CoiMapPageProps) {
  if (queryClient) {
    return (
      <QueryClientProvider client={queryClient}>
        <ChildCoiMapPage isEditing={isEditing} documentId={documentId} />
      </QueryClientProvider>
    );
  }
}
