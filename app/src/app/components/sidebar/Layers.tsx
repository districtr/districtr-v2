import maplibregl from "maplibre-gl";
import type { MutableRefObject } from "react";
import { Heading, CheckboxGroup, Flex } from "@radix-ui/themes";
import { useMapStore } from "@/app/store/mapStore";
import { BLOCK_LAYER_ID, BLOCK_HOVER_LAYER_ID } from "../../constants/layers";
import { toggleLayerVisibility } from "../../utils/helpers";

const countyLayerIds = ["counties_boundary", "counties_labels"];

/** Layers
 * This component is responsible for rendering the layers that can be toggled
 * on and off in the map.
 *
 * TODO:
 * - Support numbering for painted districts
 * - Support tribes and communities
 */
export default function Layers() {
  const { mapRef, selectedLayer, visibleLayerIds, updateVisibleLayerIds } =
    useMapStore((state) => ({
      mapRef: state.mapRef,
      selectedLayer: state.selectedLayer,
      visibleLayerIds: state.visibleLayerIds,
      updateVisibleLayerIds: state.updateVisibleLayerIds,
    }));

  const toggleLayers = (layerIds: string[]) => {
    if (mapRef && !mapRef.current) return;
    const layerUpdates = toggleLayerVisibility(mapRef, layerIds);
    updateVisibleLayerIds(layerUpdates);
  };

  return (
    <Flex gap="3" direction="column">
      <Heading as="h3" weight="bold" size="3">
        My painted districts
      </Heading>
      <CheckboxGroup.Root
        defaultValue={undefined}
        name="districts"
        value={selectedLayer !== null ? ["1"] : undefined}
      >
        <CheckboxGroup.Item
          value="1"
          onClick={() => toggleLayers([BLOCK_LAYER_ID, BLOCK_HOVER_LAYER_ID])}
          disabled={selectedLayer === null}
        >
          Show painted districts
        </CheckboxGroup.Item>
        <CheckboxGroup.Item value="2" disabled>
          Show numbering for painted districts
        </CheckboxGroup.Item>
      </CheckboxGroup.Root>
      <Heading as="h3" weight="bold" size="3">
        Boundaries
      </Heading>
      <CheckboxGroup.Root
        defaultValue={
          countyLayerIds.every((layerId) => visibleLayerIds.includes(layerId))
            ? ["1"]
            : undefined
        }
        name="contextualLayers"
      >
        <CheckboxGroup.Item
          value="1"
          onClick={() => toggleLayers(countyLayerIds)}
        >
          Show county boundaries
        </CheckboxGroup.Item>
        <CheckboxGroup.Item value="2" disabled>
          Show tribes and communities
        </CheckboxGroup.Item>
      </CheckboxGroup.Root>
    </Flex>
  );
}
