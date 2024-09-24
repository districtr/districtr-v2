import { Heading, CheckboxGroup, Flex } from "@radix-ui/themes";
import { useMapStore } from "@/app/store/mapStore";
import {
  COUNTY_LAYER_IDS,
  BLOCK_LAYER_ID,
  BLOCK_HOVER_LAYER_ID,
} from "../../constants/layers";
import { toggleLayerVisibility } from "../../utils/helpers";
import { useState } from "react";
/** Layers
 * This component is responsible for rendering the layers that can be toggled
 * on and off in the map.
 *
 * TODO:
 * - Support numbering for painted districts
 * - Support tribes and communities
 */
export default function Layers() {
  const { mapRef, selectedLayer, visibleLayerIds } = useMapStore((state) => ({
    mapRef: state.mapRef,
    selectedLayer: state.selectedLayer,
    visibleLayerIds: state.visibleLayerIds,
  }));

  const [disabled, setDisabled] = useState(true);

  const updateVisibleLayerIds = useMapStore(
    (state) => state.updateVisibleLayerIds
  );

  const toggleLayers = (layerIds: string[]) => {
    if (!mapRef || !mapRef?.current) return;
    const layerUpdates = toggleLayerVisibility(mapRef, layerIds);
    updateVisibleLayerIds(layerUpdates);
  };

  return (
    <Flex gap="3" direction="column">
      <Heading as="h3" weight="bold" size="3">
        My painted districts
      </Heading>
      <CheckboxGroup.Root
        defaultValue={[]}
        name="districts"
        value={visibleLayerIds.includes(BLOCK_LAYER_ID) ? ["1"] : []}
      >
        <CheckboxGroup.Item
          value="1"
          onClick={() => toggleLayers([BLOCK_LAYER_ID, BLOCK_HOVER_LAYER_ID])}
          disabled={selectedLayer === null}
        >
          Show painted districts
        </CheckboxGroup.Item>
        <CheckboxGroup.Item value="2" disabled={disabled}>
          Show numbering for painted districts
        </CheckboxGroup.Item>
      </CheckboxGroup.Root>
      <Heading as="h3" weight="bold" size="3">
        Boundaries
      </Heading>
      <CheckboxGroup.Root
        name="contextualLayers"
        value={
          COUNTY_LAYER_IDS.every((layerId) => visibleLayerIds.includes(layerId))
            ? ["1"]
            : []
        }
      >
        <CheckboxGroup.Item
          value="1"
          onClick={() => toggleLayers(COUNTY_LAYER_IDS)}
        >
          Show county boundaries
        </CheckboxGroup.Item>
        <CheckboxGroup.Item value="2" disabled={disabled}>
          Show tribes and communities
        </CheckboxGroup.Item>
      </CheckboxGroup.Root>
    </Flex>
  );
}
