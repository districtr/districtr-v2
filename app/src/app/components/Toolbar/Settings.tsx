import {Heading, CheckboxGroup, Flex, Button, Text} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {
  COUNTY_LAYER_IDS,
  BLOCK_LAYER_ID,
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_LAYER_ID_CHILD,
} from '../../constants/layers';
import {toggleLayerVisibility} from '../../utils/helpers';
import React from 'react';
import {ToolbarState, useToolbarStore} from '@/app/store/toolbarStore';

const TOOLBAR_SIZES: Array<{label: string; value: number}> = [
  {
    label: 'X-Small',
    value: 20,
  },
  {
    label: 'Small',
    value: 40,
  },
  {
    label: 'Medium',
    value: 60,
  },
  {
    label: 'Large',
    value: 80,
  },
];
/** Layers
 * This component is responsible for rendering the layers that can be toggled
 * on and off in the map.
 *
 * TODO:
 * - Support numbering for painted districts
 * - Support tribes and communities
 */
export const ToolSettings: React.FC = () => {
  const mapRef = useMapStore(state => state.getMapRef());
  const mapDocument = useMapStore(state => state.mapDocument);
  const visibleLayerIds = useMapStore(state => state.visibleLayerIds);
  const updateVisibleLayerIds = useMapStore(state => state.updateVisibleLayerIds);
  const toggleHighlightBrokenDistricts = useMapStore(state => state.toggleHighlightBrokenDistricts);
  const parentsAreBroken = useMapStore(state => state.shatterIds.parents.size);
  const mapOptions = useMapStore(state => state.mapOptions);
  const setMapOptions = useMapStore(state => state.setMapOptions);
  const setToolbarSize = useToolbarStore(state => state.setToolbarSize);
  const toolbarSize = useToolbarStore(state => state.toolbarSize);

  const toggleLayers = (layerIds: string[]) => {
    if (!mapRef) return;
    const layerUpdates = toggleLayerVisibility(mapRef, layerIds);
    updateVisibleLayerIds(layerUpdates);
  };

  return (
    <Flex gap="3" direction="column">
      <CheckboxGroup.Root
        defaultValue={[]}
        name="districts"
        value={[
          mapOptions.higlightUnassigned === true ? 'higlightUnassigned' : '',
          mapOptions.showPopulationTooltip === true ? 'showPopulationTooltip' : '',

          visibleLayerIds.includes(BLOCK_LAYER_ID) ? '1' : '',
          mapOptions.showZoneNumbers ? '2' : '',
          parentsAreBroken && mapOptions.showBrokenDistricts ? '3' : '',
          mapOptions.lockPaintedAreas === true ? '4' : '',
        ]}
      >
        <Heading as="h3" weight="bold" size="3">
          Map Options
        </Heading>
        <CheckboxGroup.Item
          value="showPopulationTooltip"
          onClick={() =>
            setMapOptions({
              showPopulationTooltip: !mapOptions.showPopulationTooltip,
            })
          }
        >
          Show population tooltip
        </CheckboxGroup.Item>
        <CheckboxGroup.Item
          value="1"
          onClick={() =>
            toggleLayers([
              BLOCK_LAYER_ID,
              BLOCK_HOVER_LAYER_ID,
              BLOCK_HOVER_LAYER_ID_CHILD,
              BLOCK_LAYER_ID_CHILD,
            ])
          }
          disabled={mapDocument === null}
        >
          Show painted districts
        </CheckboxGroup.Item>
        <CheckboxGroup.Item
          value="2"
          onClick={() =>
            setMapOptions({
              showZoneNumbers: !mapOptions.showZoneNumbers,
            })
          }
        >
          Show numbering for painted districts <i>(experimental)</i>
        </CheckboxGroup.Item>
        <CheckboxGroup.Item
          value="higlightUnassigned"
          onClick={() =>
            setMapOptions({
              higlightUnassigned: !mapOptions.higlightUnassigned,
            })
          }
        >
          Highlight unassigned areas
        </CheckboxGroup.Item>
        <CheckboxGroup.Item
          value="3"
          disabled={!parentsAreBroken}
          onClick={() => toggleHighlightBrokenDistricts()}
        >
          Highlight broken precincts
        </CheckboxGroup.Item>
      </CheckboxGroup.Root>
      <Heading as="h3" weight="bold" size="3">
        Boundaries
      </Heading>
      <CheckboxGroup.Root
        name="contextualLayers"
        value={[
          COUNTY_LAYER_IDS.every(layerId => visibleLayerIds.includes(layerId)) ? '1' : '',
          mapOptions.prominentCountyNames ? 'prominentCountyNames' : '',
        ]}
      >
        <CheckboxGroup.Item value="1" onClick={() => toggleLayers(COUNTY_LAYER_IDS)}>
          Show county boundaries
        </CheckboxGroup.Item>
        <CheckboxGroup.Item
          value="prominentCountyNames"
          onClick={() =>
            setMapOptions({
              prominentCountyNames: !mapOptions.prominentCountyNames,
            })
          }
        >
          Show county names
        </CheckboxGroup.Item>
        <CheckboxGroup.Item value="2" disabled>
          Show tribes and communities
        </CheckboxGroup.Item>
      </CheckboxGroup.Root>

      <Heading as="h3" weight="bold" size="3">
        Toolbar
      </Heading>
      <Text>Toolbar size:</Text>
      <Flex direction="row" gap="0">
        {TOOLBAR_SIZES.map(size => (
          <Button
            key={size.value}
            variant={toolbarSize === size.value ? 'solid' : 'outline'}
            className="rounded-none"
            onClick={() => setToolbarSize(size.value)}
          >
            {size.label}
          </Button>
        ))}
      </Flex>
    </Flex>
  );
};
