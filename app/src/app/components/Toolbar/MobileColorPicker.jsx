import React, { useState } from "react";
import { Button, IconButton, Popover } from "@radix-ui/themes"; // Import Popover from Radix
import { ZonePicker } from "./ZonePicker";
import { useMapStore } from "@/app/store/mapStore";
import { useMapControlsStore } from "@/app/store/mapControlsStore";
import { ColorWheelIcon } from "@radix-ui/react-icons";

export const MobileColorPicker = () => {
  const [open, setOpen] = useState(false);
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const colorScheme = useMapStore(state => state.colorScheme);

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
