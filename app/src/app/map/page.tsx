'use client';
import React from 'react';
import {MapContextMenu} from '../components/ContextMenu';
import {MapComponent} from '../components/Map';
import SidebarComponent from '../components/sidebar/Sidebar';
import {QueryClientProvider} from '@tanstack/react-query';
import {queryClient} from '../utils/api/queryClient';
import {ErrorNotification} from '../components/ErrorNotification';
import {useMapStore} from '../store/mapStore';
import {Toolbar} from '@components/Toolbar/Toolbar';
import {MapTooltip} from '@components/MapTooltip';
import {MapLockShade} from '@components/MapLockShade';
import {Topbar} from '@components/Topbar';

export default function Map() {
  // check if userid in local storage; if not, create one
  const userId = useMapStore(state => state.userID);
  if (!userId) {
    useMapStore.getState().setUserID();
  }

  if (queryClient) {
    return (
      <QueryClientProvider client={queryClient}>
        <div className="h-screen w-screen overflow-hidden flex justify-between p flex-col-reverse lg:flex-row-reverse landscape:flex-row-reverse">
          <SidebarComponent />
          <div
            className={`h-full relative w-full flex-1 flex flex-col lg:h-screen landscape:h-screen`}
          >
            <Topbar />
            <MapComponent />
            <Toolbar />
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
