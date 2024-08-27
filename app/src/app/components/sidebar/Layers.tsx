import maplibregl from "maplibre-gl";
import type { MutableRefObject } from "react";
import { Heading, CheckboxGroup, Flex } from "@radix-ui/themes";
import { useMapStore } from "@/app/store/mapStore";
import { BLOCK_LAYER_ID, BLOCK_HOVER_LAYER_ID } from "../../constants/layers";

/**
 * toggleLayerVisibility
 * This function is responsible for toggling the visibility of layers on the map.
 * It takes a map reference and an array of layer IDs to toggle.
 * Layers must already be added to the map and have the layout property "visibility"
 * set to "none" or "visible". If the layout property is not set, this functions assumes
 * the layer is not visible and will toggle visibility on.
 *
 * @param {MutableRefObject<maplibregl.Map>} mapRef - The map reference.
 * @param {string[]} layerIds - An array of layer IDs to toggle.
 */
export function toggleLayerVisibility(
  mapRef: MutableRefObject<maplibregl.Map>,
  layerIds: string[],
) {
  const activeLayerIds = mapRef.current
    .getStyle()
    .layers.filter((layer) => layer.layout?.visibility === "visible")
    .map((layer) => layer.id);
  layerIds.forEach((layerId) => {
    if (activeLayerIds && activeLayerIds.includes(layerId)) {
      mapRef.current.setLayoutProperty(layerId, "visibility", "none");
    } else {
      mapRef.current.setLayoutProperty(layerId, "visibility", "visible");
    }
  });
}

/** Layers
 * This component is responsible for rendering the layers that can be toggled
 * on and off in the map.
 *
 * TODO:
 * - Support numbering for painted districts
 * - Support tribes and communities
 * - Actually check that counties are visible. The default checked state
 *   is okay for now since the layers are visible by default but may not
 *   always be the case.
 */
export default function Layers() {
  const { mapRef, selectedLayer } = useMapStore((state) => ({
    mapRef: state.mapRef,
    selectedLayer: state.selectedLayer,
  }));

  const toggleLayers = (layerIds: string[]) => {
    if (mapRef && !mapRef.current) return;
    toggleLayerVisibility(mapRef, layerIds);
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
      <CheckboxGroup.Root defaultValue={["1"]} name="contextualLayers">
        <CheckboxGroup.Item
          value="1"
          onClick={() => toggleLayers(["counties_boundary", "counties_labels"])}
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
