'use client';
import React, {useRef, useEffect} from 'react';
import {Box, Flex, IconButton, ScrollArea} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import Draggable from 'react-draggable';
import {DragHandleHorizontalIcon} from '@radix-ui/react-icons';
import {ToolbarInSidebar} from './ToolbarInSidebar';
import {styled} from '@stitches/react';
import {MapContextComment} from './MapContextComment';
import {CoiCommunityViewer} from './CoiCommunityViewer';
import {DataCards} from './DataCards';

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
      pt-3 pb-3 pl-3
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
              // Clamp so the sidebar can't be dragged wider than the window — otherwise
              // its handle slides off-screen-left and gets stuck until a refresh — or
              // collapsed too small to use.
              const next = window.innerWidth - e.clientX;
              setWidth(Math.min(Math.max(next, 140), window.innerWidth - 50));
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
        <div className="flex flex-col gap-3 pr-3">
          <ToolbarInSidebar />
          <CoiCommunityViewer />
          <MapContextComment />
        </div>
        {/* The sidebar's outer padding (above) deliberately excludes the right
            side, so this ScrollArea's own box — and the Radix scrollbar
            rendered at its edge, a sibling of the scrolled content, not a
            descendant — extends all the way to the sidebar's true right edge:
            flush against the browser window, the easiest possible target to
            grab. `--scrollarea-scrollbar-vertical-margin-right` is zeroed too
            so Radix's own built-in scrollbar margin doesn't reintroduce a
            gap. The inner padding-right on DataCards' wrapper below keeps its
            visual inset the same as before; only the scrollbar moved. */}
        <StyledScrollArea
          className="size-full overflow-y-auto flex-grow-1 max-w-full"
          scrollbars="vertical"
          style={{'--scrollarea-scrollbar-vertical-margin-right': '0px'} as React.CSSProperties}
        >
          <Flex direction="column" gap="3" className="w-full" style={{paddingRight: '0.75rem'}}>
            <Box
              display={{
                initial: 'none',
                md: 'inline',
              }}
              style={{
                opacity: document_id ? 1 : 0.25,
              }}
            >
              <DataCards />
            </Box>
          </Flex>
        </StyledScrollArea>
      </Flex>
    </div>
  );
}
