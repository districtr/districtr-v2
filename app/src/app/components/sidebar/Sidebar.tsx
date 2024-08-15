import { Box, Flex } from "@radix-ui/themes";
import { MapModeSelector } from "./MapModeSelector";
import { ColorPicker } from "./ColorPicker";
import { ResetMapButton } from "./ResetMapButton";
import { GerryDBViewSelector } from "./GerryDBViewSelector";
import { HorizontalBar } from "./charts/HorizontalBarChart";

export default function SidebarComponent() {
  return (
    <Box m="3" className="max-w-sidebar w-sidebar">
      <Flex direction="column" gap="3">
        <MapModeSelector />
        <ColorPicker />
        <GerryDBViewSelector />
        <ResetMapButton />
        <HorizontalBar />
      </Flex>
    </Box>
  );
}
