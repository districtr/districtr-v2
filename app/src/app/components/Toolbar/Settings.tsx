import React from 'react';
import {Heading, CheckboxGroup, Flex, Button, Text, Box} from '@radix-ui/themes';
import {useMapStore} from '@store/mapStore';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {FALLBACK_NUM_DISTRICTS} from '@/app/constants/layers';
import {ColorChangeModal} from './ColorChangeModal';

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
  const activeLayers = useMapStore(state => state.mapOptions.activeLayers);
  const setMapOptions = useMapStore(state => state.setMapOptions);
  const setToolbarSize = useToolbarStore(state => state.setToolbarSize);
  const toolbarSize = useToolbarStore(state => state.toolbarSize);
  const customizeToolbar = useToolbarStore(state => state.customizeToolbar);
  const setCustomzieToolbar = useToolbarStore(state => state.setCustomzieToolbar);
  const toggleLayer = useMapStore(state => state.toggleLayer);

  const [colorModalOpen, setColorModalOpen] = React.useState(false);

  return (
    <>
      <Flex gap="3" direction="column">
        <CheckboxGroup.Root
          defaultValue={[]}
          name="districts"
          value={[
            activeLayers['painted-districts'] ? 'showPaintedDistricts' : '',
            activeLayers['highlight-unassigned'] ? 'higlightUnassigned' : '',
            mapOptions.showPopulationTooltip ? 'showPopulationTooltip' : '',
            activeLayers['block-population-numbers'] ? 'showBlockPopulationNumbers' : '',
            mapOptions.lockPaintedAreas.length ===
            (mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS)
              ? 'lockAll'
              : '',
            activeLayers['demography-side-by-side'] ? 'showDemographicMap' : '',
            activeLayers['county-boundaries'] ? 'showCountyBoundaries' : '',
            activeLayers['zone-numbers'] ? 'showZoneNumbers' : '',
            parentsAreBroken && activeLayers['highlight-broken'] ? 'highlightBrokenDistricts' : '',
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
            onClick={() => toggleLayer('block-population-numbers')}
          >
            Show total population labels on blocks
          </CheckboxGroup.Item>
          <CheckboxGroup.Item
            value="showPaintedDistricts"
            onClick={() => toggleLayer('painted-districts')}
            disabled={mapDocument === null}
          >
            Show painted districts
          </CheckboxGroup.Item>
          <CheckboxGroup.Item value="showZoneNumbers" onClick={() => toggleLayer('zone-numbers')}>
            Show numbering for painted districts
          </CheckboxGroup.Item>
          <CheckboxGroup.Item
            value="higlightUnassigned"
            onClick={() => toggleLayer('highlight-unassigned')}
          >
            Highlight unassigned areas
          </CheckboxGroup.Item>
          <CheckboxGroup.Item
            value="highlightBrokenDistricts"
            disabled={!parentsAreBroken}
            onClick={() => toggleLayer('highlight-broken')}
          >
            Highlight broken precincts
          </CheckboxGroup.Item>
          <Button onClick={() => setColorModalOpen(true)} variant="outline" size="1" mt="2">
            Customize district colors
          </Button>
        </CheckboxGroup.Root>
        <Heading as="h3" weight="bold" size="3">
          Boundaries
        </Heading>
        <CheckboxGroup.Root
          name="contextualLayers"
          value={[
            activeLayers['county-boundaries'] ? 'showCountyBoundaries' : '',
            activeLayers['prominent-counties'] === true ? 'prominentCountyNames' : '',
          ]}
        >
          <CheckboxGroup.Item
            value="showCountyBoundaries"
            onClick={() => toggleLayer('county-boundaries')}
          >
            Show county boundaries
          </CheckboxGroup.Item>
          <CheckboxGroup.Item
            value="prominentCountyNames"
            onClick={() => toggleLayer('prominent-counties')}
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

      <ColorChangeModal open={colorModalOpen} onClose={() => setColorModalOpen(false)} />
    </>
  );
};
