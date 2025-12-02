'use client';
import React, {useEffect} from 'react';
import {MapContextMenu} from '@components/ContextMenu';
import {MapComponent} from '@components/Map/Map';
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
import {useMapBrowserEvents} from '@/app/hooks/useMapBrowserEvents';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useDocumentWithSync} from '@/app/hooks/useDocumentWithSync';
import {SaveConflictModal} from '../SaveConflictModal';

interface MapPageProps {
  isEditing: boolean;
  mapId: string;
}

function ChildMapPage({isEditing, mapId}: MapPageProps) {
  const showDemographicMap = useMapControlsStore(
    state => state.mapOptions.showDemographicMap === 'side-by-side'
  );
  const setIsEditing = useMapControlsStore(state => state.setIsEditing);
  const toolbarLocation = useToolbarStore(state => state.toolbarLocation);
  const setErrorNotification = useMapStore(state => state.setErrorNotification);
  // check if userid in local storage; if not, create one
  const userID = useMapStore(state => state.userID);
  const setUserID = useMapStore(state => state.setUserID);

  // Load document with sync support
  const {
    isLoading: isLoadingDocument,
    error: documentError,
    conflictModal,
  } = useDocumentWithSync({
    document_id: mapId || undefined,
    enabled: !!mapId,
  });

  const loadingState = useMapBrowserEvents({
    mapId,
    isEditing,
  });

  // Handle document loading errors
  useEffect(() => {
    if (documentError && mapId) {
      setErrorNotification({
        message: `Failed to load document: ${documentError.message}`,
        id: `document-load-error-${mapId}`,
        severity: 1,
      });
    }
  }, [documentError, mapId, setErrorNotification]);

  // Set editing mode based on the route
  useEffect(() => {
    setIsEditing(isEditing);
  }, [isEditing, setIsEditing]);

  useEffect(() => {
    !userID && setUserID();
  }, [userID, setUserID]);

  useEffect(() => {
    const unsub = initSubs();
    return () => {
      console.log('unsubscribing');
      unsub();
    };
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden flex justify-between p flex-col-reverse lg:flex-row-reverse landscape:flex-row-reverse">
      <SidebarComponent />
      <div className={`h-full relative w-full flex-1 flex flex-col lg:h-screen landscape:h-screen`}>
        <Topbar />
        <Flex direction="row" height="100%">
          <MapComponent />
          {showDemographicMap && <MapComponent isDemographicMap />}
        </Flex>
        {toolbarLocation === 'map' && <DraggableToolbar />}
        {!!mapId && (
          <MapLockShade
            loadingState={{
              ...loadingState,
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

export default function MapPage({isEditing, mapId}: MapPageProps) {
  if (queryClient) {
    return (
      <QueryClientProvider client={queryClient}>
        <ChildMapPage isEditing={isEditing} mapId={mapId} />
      </QueryClientProvider>
    );
  }
}
