'use client';
import React, {useState} from 'react';
import {Box, Button, Flex, Text} from '@radix-ui/themes';
import {PinLeftIcon} from '@radix-ui/react-icons';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {Toolbar} from '../Toolbar/Toolbar';
import {useMapStore} from '@/app/store/mapStore';

export const ToolbarInSidebar = () => {
  const toolbarLocation = useToolbarStore(store => store.toolbarLocation);
  const activeTool = useMapStore(store => store.activeTool);
  const setToolbarLocation = useToolbarStore(store => store.setToolbarLocation);
  const [hovered, setHovered] = useState(false);
  if (toolbarLocation !== 'sidebar') return null;

  return (
    <Box
      className={`my-1 flex-none ${activeTool !== 'pan' && 'border-b-[1px] border-gray-500'} overflow-x-auto overflow-y-hidden`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Button
        variant="ghost"
        onClick={() => setToolbarLocation('map')}
        className={`${hovered ? '' : '!opacity-0'}`}
      >
        <Flex direction={'row'} align="center" gapX="2" p="1">
          <PinLeftIcon fontSize={'1'} />
          <Text size="1">Return toolbar to map area</Text>
        </Flex>
      </Button>
      <Toolbar />
    </Box>
  );
};
