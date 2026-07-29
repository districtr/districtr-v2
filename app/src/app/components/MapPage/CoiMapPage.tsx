'use client';
import React, {useEffect} from 'react';
import {MapContextMenu} from '@components/ContextMenu';
import {CoiMap} from '@components/Map/CoiMap';
import SidebarComponent from '@components/sidebar/Sidebar';
import {QueryClientProvider} from '@tanstack/react-query';
import {queryClient} from '@utils/api/queryClient';
import {AppNotification} from '@components/AppNotification';
import {MapTooltip} from '@components/Map/Tooltip/MapTooltip';
import {Topbar} from '@/app/components/Topbar/Topbar';
import {Flex} from '@radix-ui/themes';
import {useMapStore} from '@store/mapStore';
import {initSubs} from '@store/subscriptions';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useDocumentWithSync} from '@/app/hooks/useDocumentWithSync';
import {SaveConflictModal} from '../SaveConflictModal';
import {migrateUserMapsFromLocalStorage} from '@/app/utils/idb/migrateUserMaps';
import {DemographicMap} from '../Map/DemographicMap';
import {MobileToolbar} from '@/app/components/Toolbar/MobileToolbar';
import {useInitializeMapMode} from '@/app/hooks/useInitializeMapMode';
import {MAP_MODES} from '@constants/map/mode';
import {DEMOGRAPHIC_MODES} from '@constants/map/demographicMode';
import {isUUID} from '@/app/utils/metadata/isUUID';
import {expandUUID, PRIVATE_EDIT_ID_PARAM} from '@/app/utils/map/editUrl';
import {useRouter, useSearchParams} from 'next/navigation';
import {MAP_ROUTES} from '@constants/document/routes';

interface CoiMapPageProps {
  isEditing: boolean;
  documentId: string;
}

const ChildCoiMapPage: React.FC<CoiMapPageProps> = ({isEditing, documentId}) => {
  const router = useRouter();
  const isMapModeReady = useInitializeMapMode(MAP_MODES.COI);
  const showDemographicMap = useMapControlsStore(
    state => state.mapOptions.demographicDisplayMode === DEMOGRAPHIC_MODES.SIDE_BY_SIDE
  );
  const setIsEditing = useMapControlsStore(state => state.setIsEditing);
  const setEditableDocId = useMapControlsStore(state => state.setEditableDocId);
  const setNotification = useMapStore(state => state.setNotification);
  const userID = useMapStore(state => state.userID);
  const setUserID = useMapStore(state => state.setUserID);

  useEffect(() => {
    migrateUserMapsFromLocalStorage();
  }, []);

  // Edit URLs show the public id in the path; the editable UUID travels in the
  // private_edit_id query param (treat it like a password). An edit route
  // visited without a valid token carries no real edit capability — bounce
  // to the plain display route rather than rendering the editor against a
  // document we can't edit.
  const privateEditId = useSearchParams().get(PRIVATE_EDIT_ID_PARAM);
  const loadDocumentId = (isEditing && privateEditId && expandUUID(privateEditId)) || documentId;
  const hasEditCapability = isEditing && !!loadDocumentId && isUUID(loadDocumentId);
  const needsRedirect = isEditing && !!documentId && !hasEditCapability;
  const isPublicPage = !isEditing && !!documentId && !isUUID(documentId);

  useEffect(() => {
    if (needsRedirect) router.replace(`/${MAP_ROUTES.COI}/${documentId}`);
  }, [needsRedirect, documentId, router]);

  const {error: documentError, conflictModal} = useDocumentWithSync({
    document_id: loadDocumentId || undefined,
    isPublicPage,
    enabled: isMapModeReady && !!loadDocumentId && !needsRedirect,
  });

  useEffect(() => {
    if (documentError && documentId) {
      setNotification({
        message: `Failed to load document: ${documentError.message}`,
        id: `document-load-error-${documentId}`,
        importance: 1,
        type: 'error',
      });
    }
  }, [documentError, documentId, setNotification]);

  useEffect(() => {
    setIsEditing(isEditing);
  }, [isEditing, setIsEditing]);

  // Retain the editable UUID for this session so the view switcher can route
  // back to edit mode after navigating to a read-only display view.
  useEffect(() => {
    if (hasEditCapability) setEditableDocId(loadDocumentId);
  }, [hasEditCapability, loadDocumentId, setEditableDocId]);

  useEffect(() => {
    !userID && setUserID();
  }, [userID, setUserID]);

  useEffect(() => {
    const unsub = initSubs(isPublicPage);
    return () => {
      unsub();
    };
  }, [isPublicPage]);

  if (!isMapModeReady || needsRedirect) {
    return null;
  }

  return (
    <div className="h-screen h-dvh w-screen overflow-hidden flex justify-between p flex-col-reverse lg:flex-row-reverse landscape:flex-row-reverse">
      <SidebarComponent />
      <div
        className={`h-full relative w-full flex-1 flex flex-col lg:h-screen lg:h-dvh landscape:h-screen landscape:h-dvh`}
      >
        <Topbar />
        <Flex direction="row" className="flex-1 min-h-0">
          <CoiMap />
          {showDemographicMap && <DemographicMap />}
        </Flex>
        <MobileToolbar />
        <MapTooltip />
      </div>
      <MapContextMenu />
      <AppNotification />
      {conflictModal}
      <SaveConflictModal />
    </div>
  );
};

export default function CoiMapPage({isEditing, documentId}: CoiMapPageProps) {
  if (queryClient) {
    return (
      <QueryClientProvider client={queryClient}>
        <ChildCoiMapPage isEditing={isEditing} documentId={documentId} />
      </QueryClientProvider>
    );
  }
}
