'use client';
import React from 'react';
import {Box, Button, Flex, Popover} from '@radix-ui/themes';
import {CaretDownIcon, MixerHorizontalIcon} from '@radix-ui/react-icons';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {Toolbar} from '../Toolbar/Toolbar';
import {ToolSettings} from '../Toolbar/Settings';
import {useMapControlsStore} from '@/app/store/mapControlsStore';

// The toolbar is fixed to the sidebar; it can no longer be moved to the map area.
// Tool buttons wrap on narrow sidebars, so no horizontal scrolling here.
export const ToolbarInSidebar = () => {
  const activeTool = useMapControlsStore(store => store.activeTool);

  return (
    <Box
      className={`my-1 flex-none ${activeTool !== ACTIVE_TOOLS.PAN && 'border-b-[1px] border-gray-300'}`}
    >
      <Toolbar />
      <Flex justify="end" py="2">
        {/* Visual settings live next to the toolbar as a dropdown, not a modal. */}
        <Popover.Root>
          <Popover.Trigger>
            <Button
              variant="surface"
              color="gray"
              size="2"
              className="cursor-pointer transition-shadow hover:shadow-md"
              data-testid="visual-settings-trigger"
            >
              <MixerHorizontalIcon />
              Visual settings
              <CaretDownIcon />
            </Button>
          </Popover.Trigger>
          <Popover.Content size="1" maxHeight="70vh" align="end">
            <ToolSettings />
          </Popover.Content>
        </Popover.Root>
      </Flex>
    </Box>
  );
};
