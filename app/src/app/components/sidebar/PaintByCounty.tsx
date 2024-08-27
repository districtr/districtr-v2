import { Text, Checkbox, Flex } from "@radix-ui/themes";
import { useMapStore } from "@/app/store/mapStore";
import maplibregl from "maplibre-gl";
import type { MutableRefObject } from "react";
import { toggleLayerVisibility } from "../../utils/helpers";

export default function PaintByCounty() {
  return (
    <Text as="label" size="2">
      <Flex gap="2">
        <Checkbox defaultChecked />
        Agree to Terms and Conditions
      </Flex>
    </Text>
  );
}
