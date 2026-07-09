import React from 'react';
import {Heading, CheckboxGroup, Flex, Button, Text, Box, Select} from '@radix-ui/themes';
import {type BasemapId, BASEMAP_IDS} from '@/app/constants/map/layerStyle';
import {useFeatureFlagStore} from '@store/featureFlagStore';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {FALLBACK_NUM_DISTRICTS} from '@/app/constants/map/layerStyle';
import {ColorChangeModal} from './ColorChangeModal';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {ACCESS_STATES} from '@constants/document/state';
import {DEMOGRAPHIC_MODES} from '@constants/map/demographicMode';

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
 */
export const ToolSettings: React.FC = () => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const parentsAreBroken = useAssignmentsStore(state => state.shatterIds.parents.size);
  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const setToolbarSize = useToolbarStore(state => state.setToolbarSize);
  const toolbarSize = useToolbarStore(state => state.toolbarSize);
  const superDraw = useToolbarStore(state => state.superDraw);
  const boundarySettings = useFeatureFlagStore(state => state.boundarySettings);
  const access = useMapStore(state => state.mapStatus?.access);

  const [colorModalOpen, setColorModalOpen] = React.useState(false);

  return (
    <>
      <Flex gap="3" direction="column">
        <CheckboxGroup.Root
          defaultValue={[]}
          name="districts"
          value={[
            mapOptions.showPaintedDistricts === true ? 'showPaintedDistricts' : '',
            mapOptions.higlightUnassigned === true ? 'higlightUnassigned' : '',
            mapOptions.showPopulationTooltip === true ? 'showPopulationTooltip' : '',
            mapDocument?.child_layer && mapOptions.showBlockPopulationNumbers === true
              ? 'showBlockPopulationNumbers'
              : '',
            mapOptions.showPopulationNumbers === true ? 'showPopulationNumbers' : '',
            mapOptions.lockPaintedAreas.length ===
            (mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS)
              ? 'lockAll'
              : '',
            mapOptions.demographicDisplayMode === DEMOGRAPHIC_MODES.SIDE_BY_SIDE
              ? 'showDemographicMap'
              : '',
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

          {superDraw && (
            <Flex direction="row" gapX="2" align="center">
              <Text size="2" className="p-0">
                Basemap:
              </Text>
              <Select.Root
                value={mapOptions.basemap ?? BASEMAP_IDS.MINIMAL}
                onValueChange={(value: BasemapId) => setMapOptions({basemap: value})}
              >
                <Select.Trigger />
                <Select.Content>
                  <Select.Item value={BASEMAP_IDS.MINIMAL}>Minimal</Select.Item>
                  <Select.Item value={BASEMAP_IDS.STREETS}>Streets</Select.Item>
                  <Select.Item value={BASEMAP_IDS.SATELLITE}>Satellite</Select.Item>
                </Select.Content>
              </Select.Root>
            </Flex>
          )}
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
            value="showPopulationTooltip"
            onClick={() =>
              setMapOptions({
                showPopulationTooltip: !mapOptions.showPopulationTooltip,
              })
            }
            disabled={access === ACCESS_STATES.READ}
          >
            Show population tooltip
          </CheckboxGroup.Item>
          <CheckboxGroup.Item
            value="showPopulationNumbers"
            onClick={() =>
              setMapOptions({
                showPopulationNumbers: !mapOptions.showPopulationNumbers,
              })
            }
          >
            Show population on map (all units)
          </CheckboxGroup.Item>
          {superDraw && (
            <CheckboxGroup.Item
              value="showBlockPopulationNumbers"
              onClick={() =>
                setMapOptions({
                  showBlockPopulationNumbers: !mapOptions.showBlockPopulationNumbers,
                })
              }
              disabled={!mapDocument?.child_layer}
            >
              Show population labels on exposed blocks
            </CheckboxGroup.Item>
          )}
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
          {superDraw && (
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
          )}

          {superDraw && (
            <Button
              onClick={() => setColorModalOpen(true)}
              variant="outline"
              size="1"
              mt="2"
              disabled={access === ACCESS_STATES.READ}
            >
              Customize district colors
            </Button>
          )}
        </CheckboxGroup.Root>
        {boundarySettings && (
          <>
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
              {superDraw && (
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
              )}
            </CheckboxGroup.Root>
          </>
        )}

        <Heading as="h3" weight="bold" size="3">
          Toolbar Options
        </Heading>
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
