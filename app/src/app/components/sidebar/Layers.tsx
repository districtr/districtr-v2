import maplibregl from "maplibre-gl";
import type { MutableRefObject } from "react";
import { Heading, CheckboxGroup, Flex } from "@radix-ui/themes";
import { useMapStore } from "@/app/store/mapStore";
import { BLOCK_LAYER_ID, BLOCK_HOVER_LAYER_ID } from "../../constants/layers";

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

export default function Layers() {
  const { mapRef, selectedLayer } = useMapStore((state) => ({
    mapRef: state.mapRef,
    selectedLayer: state.selectedLayer,
  }));

  const toggleBlockLayers = () => {
    if (mapRef && !mapRef.current) return;
    toggleLayerVisibility(mapRef, [BLOCK_LAYER_ID, BLOCK_HOVER_LAYER_ID]);
  };

  const toggleCountyBoundaries = () => {
    if (mapRef && !mapRef.current) return;
    toggleLayerVisibility(mapRef, ["counties_boundary", "counties_labels"]);
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
          onClick={toggleBlockLayers}
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
        <CheckboxGroup.Item value="1" onClick={toggleCountyBoundaries}>
          Show county boundaries
        </CheckboxGroup.Item>
        <CheckboxGroup.Item value="2" disabled>
          Show tribes and communities
        </CheckboxGroup.Item>
      </CheckboxGroup.Root>
    </Flex>
  );
}
