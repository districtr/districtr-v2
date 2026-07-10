import React from 'react';
import {Heading, CheckboxGroup, Flex, Button, Text, Select} from '@radix-ui/themes';
import {type BasemapId, BASEMAP_IDS} from '@/app/constants/map/layerStyle';
import {useFeatureFlagStore} from '@store/featureFlagStore';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {useDemographyStore} from '@store/demography/demographyStore';
import {FALLBACK_NUM_DISTRICTS} from '@/app/constants/map/layerStyle';
import {ColorChangeModal} from './ColorChangeModal';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {ACCESS_STATES} from '@constants/document/state';
import {DEMOGRAPHIC_MODES} from '@constants/map/demographicMode';
import {SUMMARY_TYPES, type SummaryType} from '@constants/demography/summary';
import {overlayMemory} from '@utils/demography/overlayMemory';

/** Layers
 * This component is responsible for rendering the layers that can be toggled
 * on and off in the map.
 */
export const ToolSettings: React.FC = () => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const parentsAreBroken = useAssignmentsStore(state => state.shatterIds.parents.size);
  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const superDraw = useToolbarStore(state => state.superDraw);
  const boundarySettings = useFeatureFlagStore(state => state.boundarySettings);
  const access = useMapStore(state => state.mapStatus?.access);
  const variable = useDemographyStore(state => state.variable);
  const setVariable = useDemographyStore(state => state.setVariable);
  const availableMapVariables = useDemographyStore(state => state.availableColumnSets.map);

  const [colorModalOpen, setColorModalOpen] = React.useState(false);

  // Overlay layer toggles: once a choropleth has been configured, offer to
  // toggle it (with its last config). Super Draw always offers both types.
  const electionVariables = availableMapVariables[SUMMARY_TYPES.VOTERHISTORY] ?? [];
  const isElectionVariable = electionVariables.some(v => v.value === variable);
  const overlayOn = mapOptions.demographicDisplayMode === DEMOGRAPHIC_MODES.OVERLAY;
  const overlayGroups: Array<{group: SummaryType; label: string; active: boolean}> = (
    superDraw
      ? ([SUMMARY_TYPES.TOTPOP, SUMMARY_TYPES.VOTERHISTORY] as SummaryType[])
      : overlayMemory.lastGroup
        ? [overlayMemory.lastGroup]
        : []
  ).map(group => ({
    group,
    label: group === SUMMARY_TYPES.VOTERHISTORY ? 'election' : 'demographic',
    active:
      overlayOn &&
      (group === SUMMARY_TYPES.VOTERHISTORY ? isElectionVariable : !isElectionVariable),
  }));

  const toggleOverlayGroup = ({group, active}: {group: SummaryType; active: boolean}) => {
    if (active) {
      setMapOptions({demographicDisplayMode: undefined});
      return;
    }
    const groupVariables = availableMapVariables[group] ?? [];
    const nextVariable =
      overlayMemory.variables[group] ??
      (groupVariables.length ? groupVariables[0].value : undefined);
    if (nextVariable) {
      setVariable(nextVariable);
      overlayMemory.variables[group] = nextVariable;
    }
    overlayMemory.lastGroup = group;
    setMapOptions({demographicDisplayMode: DEMOGRAPHIC_MODES.OVERLAY});
  };

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
            Painted districts
          </CheckboxGroup.Item>
          <CheckboxGroup.Item
            value="showZoneNumbers"
            onClick={() =>
              setMapOptions({
                showZoneNumbers: !mapOptions.showZoneNumbers,
              })
            }
          >
            District numbers
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
            Population tooltip
          </CheckboxGroup.Item>
          {superDraw && (
            <CheckboxGroup.Item
              value="showPopulationNumbers"
              onClick={() =>
                setMapOptions({
                  showPopulationNumbers: !mapOptions.showPopulationNumbers,
                })
              }
            >
              Population on map (all units)
            </CheckboxGroup.Item>
          )}
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
              Population labels on exposed blocks
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
        {overlayGroups.length > 0 && (
          <>
            <Heading as="h3" weight="bold" size="3">
              Map overlay layer
            </Heading>
            <CheckboxGroup.Root
              name="overlayLayers"
              value={overlayGroups.filter(g => g.active).map(g => g.group)}
            >
              {overlayGroups.map(entry => (
                <CheckboxGroup.Item
                  key={entry.group}
                  value={entry.group}
                  onClick={() => toggleOverlayGroup(entry)}
                >
                  Toggle map overlay layer ({entry.label})
                </CheckboxGroup.Item>
              ))}
            </CheckboxGroup.Root>
          </>
        )}
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
                County boundaries
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
            </CheckboxGroup.Root>
          </>
        )}
      </Flex>

      <ColorChangeModal open={colorModalOpen} onClose={() => setColorModalOpen(false)} />
    </>
  );
};
