'use client';
import React from 'react';
import {Box, Flex} from '@radix-ui/themes';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {Toolbar} from '../Toolbar/Toolbar';
import {VisualSettingsPopover} from '../Toolbar/VisualSettingsPopover';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {useIsDesktop} from '@/app/hooks/useIsDesktop';

// The toolbar is fixed to the sidebar; it can no longer be moved to the map area.
// Tool buttons wrap on narrow sidebars, so no horizontal scrolling here.
export const ToolbarInSidebar = () => {
  const activeTool = useMapControlsStore(store => store.activeTool);
  const superDraw = useToolbarStore(state => state.superDraw);
  const stackedSidebar = useToolbarStore(state => state.stackedSidebar);
  // In the workflow-tabs layout the visual settings live in the Map Layers
  // tab ("Map options"); the popover only accompanies the legacy stacked
  // panels (Super Draw opt-out). Mobile keeps its own popover in the dock.
  const showVisualSettings = superDraw && stackedSidebar;
  // Below lg the MobileToolbar dock owns the (single) Toolbar instance — its
  // subtree registers document-level hotkey listeners, so it must never mount
  // twice. The sidebar is CSS-hidden below lg anyway.
  const isDesktop = useIsDesktop();

  return (
    <Box
      className={`my-1 flex-none ${activeTool !== ACTIVE_TOOLS.PAN && 'border-b-[1px] border-gray-300'}`}
    >
      {isDesktop && <Toolbar />}
      {showVisualSettings && (
        <Flex justify="start" py="2">
          {/* Visual settings live next to the toolbar as a dropdown, not a modal. */}
          <VisualSettingsPopover />
        </Flex>
      )}
    </Box>
  );
};
