'use client';
import React from 'react';
import DataPanels from './DataPanels';
import {Box, Flex, IconButton} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import Draggable from 'react-draggable';
import {DragHandleHorizontalIcon} from '@radix-ui/react-icons';

export default function SidebarComponent() {
  const document_id = useMapStore(store => store.mapDocument?.document_id);
  const [width, setWidth] = React.useState(
    typeof window !== 'undefined' ? window.innerWidth * 0.25 : 300
  );
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      className="
      p-3
      z-10 flex-none
      border-t lg:border-t-0
      lg:h-screen
       landscape:border-t-0
      landscape:h-screen landscape:w-[40vw]
      border-l-[1px]
      border-gray-500
      shadow-xl
      relative
      overflow-y-auto
      hidden
      lg:flex
      "
      style={{width: width, overflow: 'visible'}}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          zIndex: 999,
          top: '50vh',
          left: 0,
          position: 'absolute',
          transform: 'translate(-9px, -50%)',
        }}
      >
        <Draggable
          handle="#sidebar-handle"
          onDrag={(e: any) => {
            if (e.clientX) {
              setWidth(window.innerWidth - e.clientX);
            }
          }}
          grid={[25, 0]}
          bounds="parent"
          axis="x"
        >
          <IconButton
            variant="surface"
            color="gray"
            id="sidebar-handle"
            style={{
              width: '16px',
              background: 'rgba(245, 245, 245)',
              height: '40px',
              cursor: 'ew-resize',
              opacity: hovered ? 1 : 0,
              transition: 'opacity 0.2s',
            }}
          >
            <DragHandleHorizontalIcon />
          </IconButton>
        </Draggable>
      </div>
      <Box className="size-full overflow-y-auto">
        <Flex direction="column" gap="3">
          <Box
            display={{
              initial: 'none',
              md: 'inline',
            }}
            style={{
              opacity: document_id ? 1 : 0.25,
            }}
          >
            <DataPanels />
          </Box>
        </Flex>
      </Box>
    </div>
  );
}
