import { Box, Flex, Heading } from "@radix-ui/themes";
import { MapModeSelector } from "./MapModeSelector";
import { ColorPicker } from "./ColorPicker";
import { ResetMapButton } from "./ResetMapButton";
import { GerryDBViewSelector } from "./GerryDBViewSelector";
import { useMapStore } from "@/app/store/mapStore";
import PaintByCounty from "./PaintByCounty";
import { BrushSizeSelector } from "./BrushSizeSelector";
import React from "react";
import DataPanels from "./DataPanels";

export default function SidebarComponent() {
  const activeTool = useMapStore((state) => state.activeTool);

  return (
    <Box
      p="3"
      className="w-full z-10 shadow-md flex-none overflow-y-auto 
      border-t md:border-t-0
      md:h-screen md:max-w-sidebar md:w-sidebar"
    >
      <Flex direction="column" gap="3">
        <Heading as="h3" size="3" className="hidden md:block">
          Districtr
        </Heading>
        <GerryDBViewSelector />
        <MapModeSelector />
        {activeTool === "brush" ? (
          <div>
            <ColorPicker />
            <BrushSizeSelector />
            <PaintByCounty />{" "}
          </div>
        ) : null}
        <ResetMapButton />
        <Box
          display={{
            initial: "none",
            sm: "inline",
          }}
        >
          <DataPanels defaultPanel="layers" />
        </Box>
      </Flex>
    </Box>
  );
}
