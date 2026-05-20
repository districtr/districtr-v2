'use client';
import React, {useEffect} from 'react';
import {MapContextMenu} from '@components/ContextMenu';
import {MainMap} from '@components/Map/MainMap';
import {PublicMap} from '@components/Map/PublicMap';
import {DemographicMap} from '@components/Map/DemographicMap';
import {PublicDemographicMap} from '@components/Map/PublicDemographicMap';
import SidebarComponent from '@components/sidebar/Sidebar';
import {EvalPanel} from '@components/EvalPanel/EvalPanel';
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
import {ZoneDescriptionModal} from '@components/Map/Tooltip/ZoneDescriptionModal';
import {migrateUserMapsFromLocalStorage} from '@/app/utils/idb/migrateUserMaps';
import {isUUID} from '@/app/utils/metadata/isUUID';
import {useInitializeMapMode} from '@/app/hooks/useInitializeMapMode';
import {MAP_MODES} from '@constants/map/mode';
import {DEMOGRAPHIC_MODES} from '@constants/map/demographicMode';

interface MapPageProps {
  isEditing: boolean;
  isEval?: boolean; // Should be set when isEditing is false
  mapId: string;
}

function ChildMapPage({isEditing, isEval, mapId}: MapPageProps) {
  const isMapModeReady = useInitializeMapMode(MAP_MODES.DISTRICTS);
  const showDemographicMap = useMapControlsStore(
    state => state.mapOptions.demographicDisplayMode === DEMOGRAPHIC_MODES.SIDE_BY_SIDE
  );
  const isPublicPage = !isEditing && !!mapId && !isUUID(mapId);
  const setIsEditing = useMapControlsStore(state => state.setIsEditing);
  const setIsEval = useMapControlsStore(state => state.setIsEval);
  const toolbarLocation = useToolbarStore(state => state.toolbarLocation);
  const setErrorNotification = useMapStore(state => state.setErrorNotification);
  // check if userid in local storage; if not, create one
  const userID = useMapStore(state => state.userID);
  const setUserID = useMapStore(state => state.setUserID);
  const mapLock = useMapStore(state => state.mapLock);

  // Run migration on app load
  useEffect(() => {
    migrateUserMapsFromLocalStorage();
  }, []);

  // Load document with sync support
  const {
    isLoading: isLoadingDocument,
    error: documentError,
    conflictModal,
  } = useDocumentWithSync({
    document_id: mapId || undefined,
    isPublicPage,
    enabled: isMapModeReady && !!mapId,
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
    setIsEval(isEval ?? false);
  }, [isEval, setIsEval]);

  useEffect(() => {
    !userID && setUserID();
  }, [userID, setUserID]);

  useEffect(() => {
    const unsub = initSubs(isPublicPage);
    return () => {
      unsub();
    };
  }, [isPublicPage]);

  if (!isMapModeReady) {
    return null;
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex justify-between p flex-col-reverse lg:flex-row-reverse landscape:flex-row-reverse">
      {isPublicPage && isEval ? <EvalPanel/> : <SidebarComponent />}
      <div className={`h-full relative w-full flex-1 flex flex-col lg:h-screen landscape:h-screen`}>
        <Topbar />
        <Flex direction="row" height="100%">
          {isPublicPage ? <PublicMap /> : <MainMap />}
          {showDemographicMap && (isPublicPage ? <PublicDemographicMap /> : <DemographicMap />)}
        </Flex>
        {toolbarLocation === 'map' && <DraggableToolbar />}
        {!!mapId && (
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
      <ZoneDescriptionModal />
    </div>
  );
}

export default function MapPage({isEditing, isEval, mapId}: MapPageProps) {
  if (queryClient) {
    return (
      <QueryClientProvider client={queryClient}>
        <ChildMapPage isEditing={isEditing} isEval={isEval} mapId={mapId} />
      </QueryClientProvider>
    );
  }
}
