import React from 'react';
import {Checkbox, Flex, Text} from '@radix-ui/themes';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useMapStore} from '@store/mapStore';
import {useUiHintStore} from '@store/uiHintStore';
import {ACCESS_STATES} from '@constants/document/state';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import DisallowPaintOver from '@components/Toolbar/DisallowPaintOver';

/** The map-display toggles surfaced in the right column of
 * ToolControlsScaffold — the toolbar's only home for these now, not
 * duplicated in the Visual Settings popover or the Map Layers tab. */
export const KeyOptionToggles: React.FC = () => {
  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const access = useMapStore(state => state.mapStatus?.access);
  const activeTool = useMapControlsStore(state => state.activeTool);
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
      <DisallowPaintOver />
      <Text as="label" size="2" className="cursor-pointer select-none">
        <Flex gap="2" align="center">
          <Checkbox
            checked={mapOptions.showZoneNumbers === true}
            onCheckedChange={() => setMapOptions({showZoneNumbers: !mapOptions.showZoneNumbers})}
          />
          District numbers
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
          Population tooltip
        </Flex>
      </Text>
    </Flex>
  );
};
