import { Box, Flex } from "@radix-ui/themes";
import { MapModeSelector } from "./MapModeSelector";
import { ColorPicker } from "./ColorPicker";
import { ResetMapButton } from "./ResetMapButton";
import { GerryDBViewSelector } from "./GerryDBViewSelector";

export default function SidebarComponent() {
  return (
    <Box m="3">
      <Flex direction="column" gap="3">
        <MapModeSelector />
        <ColorPicker />
        <GerryDBViewSelector />
        <ResetMapButton />
      </Flex>
    </Box>
  );
}
