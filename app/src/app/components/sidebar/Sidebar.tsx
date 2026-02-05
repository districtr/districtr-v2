'use client';
import React, {useRef, useEffect} from 'react';
import DataPanels from './DataPanels';
import {Box, Flex, IconButton, ScrollArea} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import Draggable from 'react-draggable';
import {DragHandleHorizontalIcon} from '@radix-ui/react-icons';
import {ToolbarInSidebar} from './ToolbarInSidebar';
import {styled} from '@stitches/react';
import {MapContextComment} from './MapContextComment';

const StyledScrollArea = styled(ScrollArea, {
  maxWidth: '100%',
  '& div': {
    maxWidth: '100%',
  },
});

export default function SidebarComponent() {
  const document_id = useMapStore(store => store.mapDocument?.document_id);
  const [width, setWidth] = React.useState(350);
  const [hovered, setHovered] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);

  // Set initial width after mount to avoid hydration mismatch
  useEffect(() => {
    setWidth(window.innerWidth * 0.35);
  }, []);

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
      data-testid="sidebar"
      style={{width: width, overflow: 'visible', containerType: 'inline-size'}}
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
          nodeRef={nodeRef}
          onStart={() => {
            setDragging(true);
          }}
          onDrag={(e: any) => {
            if (e.clientX) {
              setWidth(window.innerWidth - e.clientX);
            }
          }}
          onStop={() => {
            setDragging(false);
          }}
          grid={[25, 0]}
          bounds="parent"
          axis="x"
        >
          <div ref={nodeRef}>
            <IconButton
              variant="surface"
              color="gray"
              id="sidebar-handle"
              style={{
                width: '16px',
                background: 'rgba(245, 245, 245)',
                height: '40px',
                cursor: 'ew-resize',
                opacity: dragging ? 0 : hovered ? 1 : 0,
                transition: 'opacity 0.2s',
              }}
            >
              <DragHandleHorizontalIcon />
            </IconButton>
          </div>
        </Draggable>
      </div>
      <Flex direction="column" gap="3" className="size-full">
        <ToolbarInSidebar />
        <MapContextComment />
        <StyledScrollArea
          className="size-full overflow-y-auto flex-grow-1 max-w-full"
          scrollbars="vertical"
        >
          <Flex direction="column" gap="3" className="w-full">
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
        </StyledScrollArea>
      </Flex>
    </div>
  );
}
