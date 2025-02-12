'use client';
import React from 'react';
import {MapContextMenu} from '../components/ContextMenu';
import {MapComponent} from '../components/Map/Map';
import SidebarComponent from '../components/sidebar/Sidebar';
import {QueryClientProvider} from '@tanstack/react-query';
import {queryClient} from '../utils/api/queryClient';
import {ErrorNotification} from '../components/ErrorNotification';
import {Toolbar} from '@components/Toolbar/Toolbar';
import {MapTooltip} from '@components/MapTooltip';
import {MapLockShade} from '@components/MapLockShade';
import {Topbar} from '@components/Topbar';
import { Flex } from '@radix-ui/themes';
import { useMapStore } from '../store/mapStore';

export default function Map() {
  const showDemographicMap = useMapStore(state => state.mapOptions.showDemographicMap);

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
              {showDemographicMap && <MapComponent isDemographicMap/>}
            </Flex>
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
