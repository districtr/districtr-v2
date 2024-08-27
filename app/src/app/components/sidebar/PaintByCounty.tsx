import { Text, Checkbox, Flex } from "@radix-ui/themes";
import { useMapStore } from "@/app/store/mapStore";
import { COUNTY_LAYER_IDS } from "../../constants/layers";
import { useState } from "react";

export default function PaintByCounty() {
  const { mapRef, addVisibleLayerIds } = useMapStore((state) => ({
    mapRef: state.mapRef,
    addVisibleLayerIds: state.addVisibleLayerIds,
  }));
  const [checked, setChecked] = useState(false);

  const paintByCounty = (prevIsChecked: boolean) => {
    console.log("paintByCounty", prevIsChecked);
    if (!mapRef || !mapRef?.current) return;
    if (!prevIsChecked) {
      console.log("BOX WAS NOT CHECKED, ADDING COUNTIES AS VISIBLE LAYERS");
      COUNTY_LAYER_IDS.forEach((layerId) => {
        mapRef.current?.setLayoutProperty(layerId, "visibility", "visible");
      });
      addVisibleLayerIds(COUNTY_LAYER_IDS);
    }
  };

  return (
    <Text as="label" size="2">
      <Flex gap="2">
        <Checkbox
          checked={checked}
          defaultChecked={false}
          onClick={() =>
            setChecked((prevIsChecked) => {
              paintByCounty(prevIsChecked);
              return !prevIsChecked;
            })
          }
        />
        Paint by County
      </Flex>
    </Text>
  );
}
