import React, { useState } from 'react';
import DataPanels from './DataPanels';
import {Box, Flex, Heading} from '@radix-ui/themes';
import {GerryDBViewSelector} from './GerryDBViewSelector';
import {useMapStore} from '@/app/store/mapStore';
import {ExitBlockViewButtons} from './ExitBlockViewButtons';

export default function SidebarComponent() {
  const [sidebarWidth, setSidebarWidth] = useState<number|undefined>(undefined)
  const document_id = useMapStore(store => store.mapDocument?.document_id)
  const handleResize = () => {
    // Toggle between a default width and undefined
    setSidebarWidth(prevWidth => (prevWidth === undefined ? 300 : undefined)); // Example width of 300px
  };
  return (
    <Box
      p="3"
      className="w-full z-10 shadow-md flex-none overflow-y-auto 
      border-t lg:border-t-0
      lg:h-screen lg:max-w-sidebar lg:w-sidebar
       landscape:border-t-0
      landscape:h-screen landscape:max-w-[40vw] landscape:w-[40vw]
      "
      style={{
        width: sidebarWidth 
      }}
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
            opacity: document_id ? 1 : 0.25
          }}
        >
          <DataPanels defaultPanel="population" />
        </Box>
      </Flex>
    </Box>
  );
}
