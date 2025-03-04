import React from 'react';
import {Heading, CheckboxGroup, Flex, Button, Text, Box} from '@radix-ui/themes';
import {useMapStore} from '@store/mapStore';
import {useToolbarStore} from '@/app/store/toolbarStore';

const TOOLBAR_SIZES: Array<{label: string; value: number}> = [
  {
    label: 'Small',
    value: 30,
  },
  {
    label: 'Medium',
    value: 40,
  },
  {
    label: 'Large',
    value: 54,
  },
  {
    label: 'Huge',
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
  const mapDocument = useMapStore(state => state.mapDocument);
  const parentsAreBroken = useMapStore(state => state.shatterIds.parents.size);
  const mapOptions = useMapStore(state => state.mapOptions);
  const setMapOptions = useMapStore(state => state.setMapOptions);
  const setToolbarSize = useToolbarStore(state => state.setToolbarSize);
  const toolbarSize = useToolbarStore(state => state.toolbarSize);
  const customizeToolbar = useToolbarStore(state => state.customizeToolbar);
  const setCustomzieToolbar = useToolbarStore(state => state.setCustomzieToolbar);

  return (
    <Flex gap="3" direction="column">
      <CheckboxGroup.Root
        defaultValue={[]}
        name="districts"
        value={[
          mapOptions.showPaintedDistricts === true ? 'showPaintedDistricts' : '',
          mapOptions.higlightUnassigned === true ? 'higlightUnassigned' : '',
          mapOptions.showPopulationTooltip === true ? 'showPopulationTooltip' : '',
          mapOptions.showBlockPopulationNumbers === true ? 'showBlockPopulationNumbers' : '',
          (mapOptions.lockPaintedAreas.length === (mapDocument?.num_districts ?? 4)) ? 'lockAll' : '',
          mapOptions.showDemographicMap === 'side-by-side' ? 'showDemographicMap' : '',
          mapOptions.showCountyBoundaries === true ? 'showCountyBoundaries' : '',
          mapOptions.showZoneNumbers === true ? 'showZoneNumbers' : '',
          parentsAreBroken && mapOptions.highlightBrokenDistricts === true
            ? 'highlightBrokenDistricts'
            : '',
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
          value="showBlockPopulationNumbers"
          onClick={() =>
            setMapOptions({
              showBlockPopulationNumbers: !mapOptions.showBlockPopulationNumbers,
            })
          }
        >
          Show total population labels on blocks
        </CheckboxGroup.Item>
        <CheckboxGroup.Item
          value="showPaintedDistricts"
          onClick={() =>
            setMapOptions({
              showPaintedDistricts: !mapOptions.showPaintedDistricts,
            })
          }
          disabled={mapDocument === null}
        >
          Show painted districts
        </CheckboxGroup.Item>
        <CheckboxGroup.Item
          value="showZoneNumbers"
          onClick={() =>
            setMapOptions({
              showZoneNumbers: !mapOptions.showZoneNumbers,
            })
          }
        >
          Show numbering for painted districts
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
          value="highlightBrokenDistricts"
          disabled={!parentsAreBroken}
          onClick={() =>
            setMapOptions({
              highlightBrokenDistricts: !mapOptions.highlightBrokenDistricts,
            })
          }
        >
          Highlight broken precincts
        </CheckboxGroup.Item>
        <CheckboxGroup.Item
          value="showDemographicMap"
          onClick={() => setMapOptions({
            showDemographicMap: !mapOptions.showDemographicMap ? 'side-by-side' : undefined,
          })}
        >
          Show Demographic Map
        </CheckboxGroup.Item>
      </CheckboxGroup.Root>
      <Heading as="h3" weight="bold" size="3">
        Boundaries
      </Heading>
      <CheckboxGroup.Root
        name="contextualLayers"
        value={[
          mapOptions.showCountyBoundaries === true ? 'showCountyBoundaries' : '',
          mapOptions.prominentCountyNames === true ? 'prominentCountyNames' : '',
        ]}
      >
        <CheckboxGroup.Item
          value="showCountyBoundaries"
          onClick={() =>
            setMapOptions({
              showCountyBoundaries: !mapOptions.showCountyBoundaries,
            })
          }
        >
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
          Emphasize county names
        </CheckboxGroup.Item>
        <CheckboxGroup.Item value="2" disabled>
          Show tribes and communities
        </CheckboxGroup.Item>
      </CheckboxGroup.Root>

      <CheckboxGroup.Root
        defaultValue={[]}
        name="toolbar"
        value={[customizeToolbar ? 'customizeToolbar' : '']}
      >
        <Heading as="h3" weight="bold" size="3">
          Toolbar Options
        </Heading>
        <CheckboxGroup.Item
          value="customizeToolbar"
          onClick={() => setCustomzieToolbar(!customizeToolbar)}
        >
          Enable draggable toolbar
        </CheckboxGroup.Item>
      </CheckboxGroup.Root>
      <Box>
        <Text size="2" className="p-0">
          Toolbar size:
        </Text>
        <Flex direction="row" gapX="2" wrap="wrap" pt="0">
          {TOOLBAR_SIZES.map(size => (
            <Button
              key={size.value}
              variant={'ghost'}
              style={{
                fontWeight: toolbarSize === size.value ? 'bold' : 'normal',
              }}
              onClick={() => setToolbarSize(size.value)}
            >
              {size.label}
            </Button>
          ))}
        </Flex>
      </Box>
    </Flex>
  );
};
