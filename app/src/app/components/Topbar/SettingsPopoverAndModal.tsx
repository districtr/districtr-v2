import {IconButton, Text, Box, Popover, Dialog} from '@radix-ui/themes';
import {useState} from 'react';
import {ToolSettings} from '../Toolbar/Settings';
import {Cross2Icon, GearIcon} from '@radix-ui/react-icons';

export const SettingsPopoverAndModal = () => {
  const [hovered, setHovered] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <>
      <Popover.Root open={hovered}>
        <Popover.Trigger>
          <IconButton
            variant="ghost"
            size="1"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={() => setModalOpen(true)}
          >
            <GearIcon className="size-full" />
          </IconButton>
        </Popover.Trigger>
        <Popover.Content align="center">
          <Text size="1"> Click  <GearIcon className="size-4 inline" /> to open settings</Text>
        </Popover.Content>
      </Popover.Root>

      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Content>
          <Box className="size-full relative">
            <IconButton
              className="!absolute !top-0 !right-0"
              variant="ghost"
              onClick={() => setModalOpen(false)}
            >
              <Cross2Icon />
            </IconButton>
            <ToolSettings />
          </Box>
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
};
