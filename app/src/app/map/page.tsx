'use client';
import React from 'react';
import {MapContextMenu} from '../components/ContextMenu';
import {MapComponent} from '../components/Map';
import SidebarComponent from '../components/sidebar/Sidebar';
import {QueryClientProvider} from '@tanstack/react-query';
import {queryClient} from '../utils/api/queryClient';
import { ErrorNotification } from '../components/ErrorNotification';

export default function Map() {
  if (queryClient) {
    return (
      <QueryClientProvider client={queryClient}>
        <div className="h-screen w-screen overflow-hidden flex justify-between p flex-col-reverse lg:flex-row-reverse landscape:flex-row-reverse">
          <SidebarComponent />
          <MapComponent />
          <MapContextMenu />
          <ErrorNotification />
        </div>
      </QueryClientProvider>
    );
  }
}
