'use client';
import React from 'react';
import {Box} from '@radix-ui/themes';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {Toolbar} from '../Toolbar/Toolbar';
import {useMapControlsStore} from '@/app/store/mapControlsStore';

// The toolbar is fixed to the sidebar; it can no longer be moved to the map area.
export const ToolbarInSidebar = () => {
  const activeTool = useMapControlsStore(store => store.activeTool);

  return (
    <Box
      className={`my-1 flex-none ${activeTool !== ACTIVE_TOOLS.PAN && 'border-b-[1px] border-gray-300'} overflow-x-auto overflow-y-hidden`}
    >
      <Toolbar />
    </Box>
  );
};
