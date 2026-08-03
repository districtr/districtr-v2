import React from 'react';
import {Checkbox, Flex, Text} from '@radix-ui/themes';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useMapStore} from '@store/mapStore';
import {useUiHintStore} from '@store/uiHintStore';
import {ACCESS_STATES} from '@constants/document/state';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {MAP_MODES} from '@constants/map/mode';
import {HelpTip, HELP_TIP_HOVER_DELAY} from '@components/HelpTip/HelpTip';

/** The map-display toggles surfaced in the right column of
 * ToolControlsScaffold — the toolbar's only home for these now, not
 * duplicated in the Visual Settings popover or the Map Layers tab. */
export const KeyOptionToggles: React.FC = () => {
  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const access = useMapStore(state => state.mapStatus?.access);
  const activeTool = useMapControlsStore(state => state.activeTool);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const disallowPaintOverDisabled = access === ACCESS_STATES.READ;
  // The population tooltip only shows on hover while actively painting —
  // it's a no-op during Pan, so the toggle is disabled there too (District
  // numbers stays enabled; that display doesn't depend on the active tool).
  const populationTooltipDisabled =
    access === ACCESS_STATES.READ || activeTool === ACTIVE_TOOLS.PAN;
  // DraftStatusHelper's "Show population tooltips as you paint" hint pulses
  // this row directly — it lives here, not inside any jump-able sidebar tab.
  const flashing = useUiHintStore(state => state.flashTarget === 'population-tooltip');

  return (
    <Flex direction="column" gap="2">
      {mapMode !== MAP_MODES.COI && (
        <HelpTip tip="disallowPaintOver" openDelay={HELP_TIP_HOVER_DELAY}>
          <Text as="label" size="2" className="cursor-pointer select-none">
            <Flex gap="2" align="center">
              <Checkbox
                checked={!!mapOptions.disallowPaintOver}
                onCheckedChange={() =>
                  setMapOptions({disallowPaintOver: !mapOptions.disallowPaintOver})
                }
                disabled={disallowPaintOverDisabled}
              />
              Only paint unassigned areas
            </Flex>
          </Text>
        </HelpTip>
      )}
      <Text as="label" size="2" className="cursor-pointer select-none">
        <Flex gap="2" align="center">
          <Checkbox
            checked={mapOptions.showZoneNumbers === true}
            onCheckedChange={() => setMapOptions({showZoneNumbers: !mapOptions.showZoneNumbers})}
          />
          Show district numbers
        </Flex>
      </Text>
      <Text
        as="label"
        size="2"
        className={`${populationTooltipDisabled ? 'select-none' : 'cursor-pointer select-none'} ${flashing ? 'ui-flash' : ''}`}
        style={populationTooltipDisabled ? {opacity: 0.5} : undefined}
      >
        <Flex gap="2" align="center">
          <Checkbox
            checked={mapOptions.showPopulationTooltip === true}
            onCheckedChange={() =>
              setMapOptions({showPopulationTooltip: !mapOptions.showPopulationTooltip})
            }
            disabled={populationTooltipDisabled}
          />
          Show population on hover
        </Flex>
      </Text>
    </Flex>
  );
};
