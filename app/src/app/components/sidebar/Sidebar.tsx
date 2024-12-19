import React from 'react';
import DataPanels from './DataPanels';
import {Box, Flex, Heading, IconButton} from '@radix-ui/themes';
import {GerryDBViewSelector} from './GerryDBViewSelector';
import {useMapStore} from '@/app/store/mapStore';
import {ExitBlockViewButtons} from './ExitBlockViewButtons';
import {Resizable} from 're-resizable';
import {DragHandleHorizontalIcon} from '@radix-ui/react-icons';

const HandleIconButton = () => {
  return (
    <IconButton
      variant="classic"
      color="gray"
      style={{
        zIndex: 999,
        top: '50vh',
        position: 'fixed',
        width: '16px',
        height: '60px',
        transform: 'translate(-2px, -50%)',
        cursor: 'ew-resize',
      }}
    >
      <DragHandleHorizontalIcon />
    </IconButton>
  );
};

export default function SidebarComponent() {
  const document_id = useMapStore(store => store.mapDocument?.document_id);

  return (
    <Resizable handleComponent={{left: <HandleIconButton />}}>
      <Box
        p="3"
        className="z-10 flex-none overflow-y-auto 
      border-t lg:border-t-0
      lg:h-screen
       landscape:border-t-0
      landscape:h-screen landscape:w-[40vw]
      border-l-2
      border-gray-500
      shadow-xl
      "
        style={{width: '100%'}}
      >
        <Flex direction="column" gap="3">
          <Heading as="h3" size="3" className="hidden lg:block">
            Districtr
          </Heading>
          <GerryDBViewSelector />
          {/* <MapModeSelector /> */}
          {/* {activeTool === 'brush' || activeTool === 'eraser' ? (
          <div
            className="gap-4 lg:gap-0 landscape:gap-0
          flex flex-row-reverse lg:flex-col landscape:flex-col
          justify-around
          "
          >
            <div className="flex-grow">
              <BrushSizeSelector />
              <PaintByCounty />{' '}
            </div>
            {activeTool === 'brush' ? (
              <div className="flex-grow-0 flex-row">
                <span className="hidden md:block landscape:block">
                  <ZonePicker />
                </span>
                <span className="md:hidden landscape:hidden">
                  <MobileColorPicker />
                </span>
              </div>
            ) : null}
          </div>
        ) : null} */}

          {/* {activeTool === 'lock' ? (
          <div>
            <ZoneLockPicker />
          </div>
        ) : null} */}
          {/* <ResetMapButton /> */}
          <ExitBlockViewButtons />

          <Box
            display={{
              initial: 'none',
              md: 'inline',
            }}
            style={{
              opacity: document_id ? 1 : 0.25,
            }}
          >
            <DataPanels defaultPanel="population" />
          </Box>
        </Flex>
      </Box>
    </Resizable>
  );
}
