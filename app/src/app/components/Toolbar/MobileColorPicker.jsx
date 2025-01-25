import React, { useState } from "react";
import { Button, IconButton, Popover } from "@radix-ui/themes"; // Import Popover from Radix
import { ZonePicker } from "./ZonePicker";
import { colorScheme } from "@/app/constants/colors";
import { useMapStore } from "@/app/store/mapStore";
import { ColorWheelIcon } from "@radix-ui/react-icons";

export const MobileColorPicker = () => {
  const [open, setOpen] = useState(false);
  const selectedZone = useMapStore((state) => state.selectedZone);

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
