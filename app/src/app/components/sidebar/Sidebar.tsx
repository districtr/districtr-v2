import React from 'react';
import DataPanels from './DataPanels';
import {Box, Flex, Heading, IconButton} from '@radix-ui/themes';
import {GerryDBViewSelector} from './GerryDBViewSelector';
import {useMapStore} from '@/app/store/mapStore';
import {ExitBlockViewButtons} from './ExitBlockViewButtons';
import {Resizable} from 're-resizable';
import {DragHandleHorizontalIcon} from '@radix-ui/react-icons';
import {ZonePicker} from './ZonePicker';
import {ZoneLockPicker} from './ZoneLockPicker';
import {MobileColorPicker} from './MobileColorPicker';
import { UndoRedoButton } from './UndoRedoButton';

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
    </Resizable>
  );
}
