'use client';
import React, {useEffect} from 'react';
import {MapContextMenu} from '@components/ContextMenu';
import {MapComponent} from '@components/Map/Map';
import SidebarComponent from '@components/sidebar/Sidebar';
import {QueryClientProvider} from '@tanstack/react-query';
import {queryClient} from '@utils/api/queryClient';
import {ErrorNotification} from '@components/ErrorNotification';
import {DraggableToolbar, Toolbar} from '@components/Toolbar/Toolbar';
import {MapTooltip} from '@components/MapTooltip';
import {MapLockShade} from '@components/MapLockShade';
import {Topbar} from '@/app/components/Topbar/Topbar';
import {Flex} from '@radix-ui/themes';
import {useMapStore} from '@store/mapStore';
import {initSubs} from '@store/subscriptions';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {useMapBrowserEvents} from '@/app/hooks/useMapBrowserEventsV2';
import {useSearchParams} from 'next/navigation';

export default function Map() {
  const showDemographicMap = useMapStore(
    state => state.mapOptions.showDemographicMap === 'side-by-side'
  );
  const toolbarLocation = useToolbarStore(state => state.toolbarLocation);
  // check if userid in local storage; if not, create one
  const userID = useMapStore(state => state.userID);
  const setUserID = useMapStore(state => state.setUserID);
  const searchParams = useSearchParams();

  // This page is for legacy URL support with document_id query parameter
  const documentId = searchParams.get('document_id');

  useMapBrowserEvents({
    mapId: '',
    isEditing: false,
  });

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

  // Handle legacy redirect after hooks have been called
  useEffect(() => {
    if (documentId) {
      // Redirect to new URL structure
      window.location.href = `/map/edit/${documentId}`;
    }
  }, [documentId]);

  if (queryClient) {
    return (
      <QueryClientProvider client={queryClient}>
        <div className="h-screen w-screen overflow-hidden flex justify-between p flex-col-reverse lg:flex-row-reverse landscape:flex-row-reverse">
          <SidebarComponent />
          <div
            className={`h-full relative w-full flex-1 flex flex-col lg:h-screen landscape:h-screen`}
          >
            <Topbar />
            <Flex direction="row" height="100%">
              <MapComponent />
              {showDemographicMap && <MapComponent isDemographicMap />}
            </Flex>
            {toolbarLocation === 'map' && <DraggableToolbar />}
            <MapLockShade />
            <MapTooltip />
          </div>
          <MapContextMenu />
          <ErrorNotification />
        </div>
      </QueryClientProvider>
    );
  }
}
