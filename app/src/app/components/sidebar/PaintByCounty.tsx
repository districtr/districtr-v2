import { Box, Text, Checkbox, Flex } from "@radix-ui/themes";
import { useMapStore } from "@/app/store/mapStore";
import { COUNTY_LAYER_IDS } from "../../constants/layers";
import { useState, useEffect } from "react";

export default function PaintByCounty() {
  const { mapRef, addVisibleLayerIds } = useMapStore((state) => ({
    mapRef: state.mapRef,
    addVisibleLayerIds: state.addVisibleLayerIds,
  }));
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!mapRef || !mapRef.current) return;

    if (checked) {
      COUNTY_LAYER_IDS.forEach((layerId) => {
        mapRef.current?.setLayoutProperty(layerId, "visibility", "visible");
      });
      addVisibleLayerIds(COUNTY_LAYER_IDS);
    }
  }, [checked, mapRef, addVisibleLayerIds]);

  return (
    <Box>
      <Text as="label" size="2">
        <Flex gap="2">
          <Checkbox
            checked={checked}
            defaultChecked={false}
            onClick={() => setChecked((prevIsChecked) => !prevIsChecked)}
          />
          Paint by County
        </Flex>
      </Text>
      <Text size="1" color="red">
        <b>Note:</b> paint-by-county feature not yet implemented.
      </Text>
    </Box>
  );
}
