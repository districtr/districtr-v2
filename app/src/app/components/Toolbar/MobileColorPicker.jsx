import React, { useState } from "react";
import { IconButton, Popover } from "@radix-ui/themes"; // Import Popover from Radix
import { ZonePicker } from "./ZonePicker";
import { useMapControlsStore } from "@/app/store/mapControlsStore";
import { ColorWheelIcon } from "@radix-ui/react-icons";
import { useColorScheme } from '@/app/hooks/useColorScheme';

export const MobileColorPicker = () => {
  const [open, setOpen] = useState(false);
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const colorScheme = useColorScheme();

  const zoneIndex = selectedZone ? selectedZone - 1 : 0;
  const color = colorScheme[zoneIndex];

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <IconButton
          radius="full"
          style={{ background: color }}
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
