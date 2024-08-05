import { Flex } from "@radix-ui/themes";
import { ZoneTypeSelector } from "./Picker";
import { GerryDBViewSelector } from "./GerryDBViewSelector";

export default function SidebarComponent() {
  return (
    <div className="h-full w-sidebar m-3 pt-3">
      <Flex direction="column" gap="3">
        <GerryDBViewSelector />
        <ZoneTypeSelector />
      </Flex>
    </div>
  );
}
