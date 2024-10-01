import { Box, Flex, Heading } from "@radix-ui/themes";
import { MapModeSelector } from "./MapModeSelector";
import { ColorPicker } from "./ColorPicker";
import { ResetMapButton } from "./ResetMapButton";
import { GerryDBViewSelector } from "./GerryDBViewSelector";
import { HorizontalBar } from "./charts/HorizontalBarChart";
import { useMapStore } from "@/app/store/mapStore";
import { Tabs, Text } from "@radix-ui/themes";
import Layers from "./Layers";
import PaintByCounty from "./PaintByCounty";
import { BrushSizeSelector } from "./BrushSizeSelector";
import { styled } from "@stitches/react";

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
        {activeTool === "brush" || activeTool === "eraser" ? (
          <div>
            <BrushSizeSelector />
            <PaintByCounty />{" "}
          </div>
        ) : null}
        {activeTool === "brush" ? (
          <div>
            <ColorPicker />
          </div>
        ) : null}
        <ResetMapButton />
        <Box
          display={{
            initial: "none",
            sm: "inline",
          }}
        >
        <Tabs.Root defaultValue="layers">
          <Tabs.List>
            <Tabs.Trigger value="population"> Population </Tabs.Trigger>
            <Tabs.Trigger value="layers"> Data layers </Tabs.Trigger>
            <Tabs.Trigger value="evaluation"> Evaluation </Tabs.Trigger>
          </Tabs.List>
          <Box pt="3">
            <Tabs.Content value="population">
              <HorizontalBar />
            </Tabs.Content>
            <Tabs.Content value="layers">
              <Layers />
            </Tabs.Content>
            <Tabs.Content value="evaluation">
              <Text size="2"> Unimplemented </Text>
            </Tabs.Content>
          </Box>
        </Tabs.Root>
        </Box>
      </Flex>
    </Box>
  );
}
