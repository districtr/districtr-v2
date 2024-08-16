import { Box, Flex, Heading } from "@radix-ui/themes";
import { MapModeSelector } from "./MapModeSelector";
import { ColorPicker } from "./ColorPicker";
import { ResetMapButton } from "./ResetMapButton";
import { GerryDBViewSelector } from "./GerryDBViewSelector";
import { HorizontalBar } from "./charts/HorizontalBarChart";

export default function SidebarComponent() {
  return (
    <Box p="3" className="max-w-sidebar w-sidebar z-10 shadow-md">
      <Flex direction="column" gap="3">
        <Heading as="h3" size="3">
          Geography
        </Heading>
        <GerryDBViewSelector />
        <Heading as="h3" size="3">
          Controls
        </Heading>
        <MapModeSelector />
        <ColorPicker />
        <ResetMapButton />
        <HorizontalBar />
      </Flex>
    </Box>
  );
}
