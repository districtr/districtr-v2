import { Box, Text, Checkbox, Flex } from "@radix-ui/themes";
import { useMapStore } from "@/app/store/mapStore";
import { COUNTY_LAYER_IDS } from "../../constants/layers";
import { useState, useEffect } from "react";
import {
  getFeaturesInBbox,
  getFeaturesIntersectingCounties,
} from "../../utils/helpers";

export default function PaintByCounty() {
  const mapRef = useMapStore((state) => state.getMapRef());
  const addVisibleLayerIds = useMapStore((state) => state.addVisibleLayerIds);
  const setPaintFunction = useMapStore((state) => state.setPaintFunction);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!mapRef) return;

    if (checked) {
      COUNTY_LAYER_IDS.forEach((layerId) => {
        mapRef.setLayoutProperty(layerId, "visibility", "visible");
      });
      addVisibleLayerIds(COUNTY_LAYER_IDS);
      setPaintFunction(getFeaturesIntersectingCounties);
    } else {
      setPaintFunction(getFeaturesInBbox);
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
      <Text size="1" color="gray">
        Paint-by-county feature is still experimental.
      </Text>
    </Box>
  );
}
