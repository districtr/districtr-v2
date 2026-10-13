'use client';
import React from 'react';
import {Box} from '@radix-ui/themes';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {Toolbar} from '../Toolbar/Toolbar';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useIsDesktop} from '@/app/hooks/useIsDesktop';

// The toolbar is fixed to the sidebar; it can no longer be moved to the map area.
// Tool buttons wrap on narrow sidebars, so no horizontal scrolling here.
// Visual settings lives below in DataCards (Map Layers tab / stacked header
// row); mobile keeps its own popover in the dock.
export const ToolbarInSidebar = () => {
  const activeTool = useMapControlsStore(store => store.activeTool);
  // Below lg the MobileToolbar dock owns the (single) Toolbar instance — its
  // subtree registers document-level hotkey listeners, so it must never mount
  // twice. The sidebar is CSS-hidden below lg anyway.
  const isDesktop = useIsDesktop();

  return (
    <Box
      className={`my-1 flex-none ${activeTool !== ACTIVE_TOOLS.PAN && 'border-b-[1px] border-gray-300'}`}
    >
      {isDesktop && <Toolbar />}
    </Box>
  );
};
