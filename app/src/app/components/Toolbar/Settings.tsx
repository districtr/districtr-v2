import React from 'react';
import {Heading, CheckboxGroup, Flex, Text, Select, RadioCards} from '@radix-ui/themes';
import {type BasemapId, BASEMAP_IDS} from '@/app/constants/map/layerStyle';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {useDemographyStore} from '@store/demography/demographyStore';
import {FALLBACK_NUM_DISTRICTS} from '@/app/constants/map/layerStyle';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {DEMOGRAPHIC_MODES} from '@constants/map/demographicMode';
import {SUMMARY_TYPES, type OverlayGroup} from '@constants/demography/summary';
import {
  activateOverlayGroup,
  deactivateOverlay,
  overlayGroupVariables,
  overlayMemory,
} from '@utils/demography/overlayMemory';

/** Layers
 * This component is responsible for rendering the layers that can be toggled
 * on and off in the map.
 */
/** inWorkflowTab: the sidebar's Map Layers tab renders its own section header
 * and per-section display-mode controls, so this component drops its "Map
 * Options" title and the overlay-layer picker there; popover contexts (stacked
 * layout, mobile dock) keep both. */
export const ToolSettings: React.FC<{inWorkflowTab?: boolean}> = ({inWorkflowTab}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const parentsAreBroken = useAssignmentsStore(state => state.shatterIds.parents.size);
  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const superDraw = useToolbarStore(state => state.superDraw);
  const variable = useDemographyStore(state => state.variable);
  const availableMapVariables = useDemographyStore(state => state.availableColumnSets.map);

  // Overlay layer: one selection among none / demographic / election (the
  // groups are mutually exclusive, so this is a mode picker, not independent
  // checkboxes). Super Draw offers every group with data on this map; Draw
  // offers each group once it's actually been used.
  const electionVariables = availableMapVariables[SUMMARY_TYPES.VOTERHISTORY] ?? [];
  const isElectionVariable = electionVariables.some(v => v.value === variable);
  // "On" means either display mode — overlay or the side-by-side comparison.
  const overlayOn = mapOptions.demographicDisplayMode !== undefined;
  const allGroups: OverlayGroup[] = ['demography', 'election'];
  const overlayGroups: Array<{group: OverlayGroup; label: string}> = (
    superDraw ? allGroups : allGroups.filter(group => overlayMemory.variables[group])
  )
    .filter(group => overlayGroupVariables(group).length > 0)
    .map(group => ({
      group,
      label: group === 'election' ? 'Election' : 'Demographic',
    }));
  const overlayValue = !overlayOn ? 'none' : isElectionVariable ? 'election' : 'demography';

  const handleOverlayChange = (value: string) => {
    if (value === 'none') {
      deactivateOverlay();
      return;
    }
    activateOverlayGroup(value as OverlayGroup);
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
            mapOptions.showPopulationNumbers === true ? 'showPopulationNumbers' : '',
            mapOptions.lockPaintedAreas.length ===
            (mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS)
              ? 'lockAll'
              : '',
            mapOptions.demographicDisplayMode === DEMOGRAPHIC_MODES.SIDE_BY_SIDE
              ? 'showDemographicMap'
              : '',
            parentsAreBroken && mapOptions.highlightBrokenDistricts === true
              ? 'highlightBrokenDistricts'
              : '',
          ]}
        >
          {!inWorkflowTab && (
            <Heading as="h3" weight="bold" size="3">
              Map Options
            </Heading>
          )}

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
          {superDraw && (
            <CheckboxGroup.Item
              value="showPopulationNumbers"
              onClick={() =>
                setMapOptions({
                  showPopulationNumbers: !mapOptions.showPopulationNumbers,
                })
              }
            >
              Population numbers
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
        </CheckboxGroup.Root>
        {!inWorkflowTab && overlayGroups.length > 0 && (
          <Flex direction="row" align="center" gap="3" wrap="wrap">
            <Heading as="h3" weight="bold" size="3">
              {/* Super Draw can show the choropleth as overlay OR comparison,
                  so "overlay" would be a misnomer there. */}
              {superDraw ? 'Map choropleth layer' : 'Map overlay layer'}
            </Heading>
            <RadioCards.Root
              size="1"
              gap="2"
              style={{display: 'flex', flexWrap: 'wrap'}}
              value={overlayValue}
              onValueChange={handleOverlayChange}
            >
              <RadioCards.Item value="none" className="cursor-pointer">
                <Text size="2">None</Text>
              </RadioCards.Item>
              {overlayGroups.map(entry => (
                <RadioCards.Item key={entry.group} value={entry.group} className="cursor-pointer">
                  <Text size="2">{entry.label}</Text>
                </RadioCards.Item>
              ))}
            </RadioCards.Root>
          </Flex>
        )}
      </Flex>
    </>
  );
};
