import React from 'react';
import DataPanels from './DataPanels';
import {Box, Flex, Heading} from '@radix-ui/themes';
import {MapModeSelector} from './MapModeSelector';
import {ResetMapButton} from './ResetMapButton';
import {GerryDBViewSelector} from './GerryDBViewSelector';
import {useMapStore} from '@/app/store/mapStore';
import PaintByCounty from './PaintByCounty';
import {BrushSizeSelector} from './BrushSizeSelector';
import {ExitBlockViewButtons} from './ExitBlockViewButtons';
import {ZonePicker} from './ZonePicker';
import {ZoneLockPicker} from './ZoneLockPicker';
import {MobileColorPicker} from './MobileColorPicker';

export default function SidebarComponent() {
  const activeTool = useMapStore(state => state.activeTool);

  return (
    <Box
      p="3"
      className="w-full z-10 shadow-md flex-none overflow-y-auto 
      border-t lg:border-t-0
      lg:h-screen lg:max-w-sidebar lg:w-sidebar
       landscape:border-t-0
      landscape:h-screen landscape:max-w-[40vw] landscape:w-[40vw]
      
      "
    >
      <Flex direction="column" gap="3">
        <Heading as="h3" size="3" className="hidden lg:block">
          Districtr
        </Heading>
        <GerryDBViewSelector />
        <MapModeSelector />
        {activeTool === 'brush' || activeTool === 'eraser' ? (
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
          </div>
        ) : null}

        {activeTool === 'brush' ? (
          <div className="flex-grow-0">
            <span className="hidden md:block landscape:block">
              <ZonePicker />
            </span>
            <span className="md:hidden landscape:hidden">
              <MobileColorPicker />
            </span>
          </div>
        ) : null}

        {activeTool === 'lock' ? (
          <div>
            <ZoneLockPicker />
          </div>
        ) : null}
        <ResetMapButton />
        <ExitBlockViewButtons />

        <Box
          display={{
            initial: 'none',
            md: 'inline',
          }}
        >
          <DataPanels defaultPanel="layers" />
        </Box>
      </Flex>
    </Box>
  );
}
