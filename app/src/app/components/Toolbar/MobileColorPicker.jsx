import React, {useState} from 'react';
import {IconButton, Popover} from '@radix-ui/themes'; // Import Popover from Radix
import {ZonePicker} from './ZonePicker';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {ColorWheelIcon} from '@radix-ui/react-icons';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';

export const MobileColorPicker = () => {
  const [open, setOpen] = useState(false);
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const getZoneColor = useZoneColorGetter();
  const color = getZoneColor(selectedZone, '#000000');

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <IconButton
          radius="full"
          style={{background: color}}
          size="3"
          aria-label="Choose map districtr assignment brush color"
        >
          <ColorWheelIcon />
        </IconButton>
      </Popover.Trigger>
      <Popover.Content width="95vw">
        <ZonePicker />
      </Popover.Content>
    </Popover.Root>
  );
};
