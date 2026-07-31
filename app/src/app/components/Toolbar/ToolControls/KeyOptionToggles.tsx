import React from 'react';
import {Checkbox, Flex, Text} from '@radix-ui/themes';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useMapStore} from '@store/mapStore';
import {ACCESS_STATES} from '@constants/document/state';
import {ACTIVE_TOOLS} from '@constants/map/tools';

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
  const populationTooltipDisabled = access === ACCESS_STATES.READ || activeTool === ACTIVE_TOOLS.PAN;

  return (
    <Flex direction="column" gap="2">
      <Text as="label" size="2" className="cursor-pointer select-none">
        <Flex gap="2" align="center">
          <Checkbox
            checked={mapOptions.showZoneNumbers === true}
            onCheckedChange={() =>
              setMapOptions({showZoneNumbers: !mapOptions.showZoneNumbers})
            }
          />
          District numbers
        </Flex>
      </Text>
      <Text
        as="label"
        size="2"
        className={populationTooltipDisabled ? 'select-none' : 'cursor-pointer select-none'}
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
      {/* Placeholder for issue #677's "Disallow paint over" toggle — this branch's
          MapOptions has no disallowPaintOver field yet, so the control is rendered
          inert (no checked state, no handler) until that field lands. */}
      <Text as="label" size="2" className="select-none" style={{opacity: 0.5}}>
        <Flex gap="2" align="center">
          <Checkbox checked={false} disabled />
          Disallow paint over
        </Flex>
      </Text>
    </Flex>
  );
};
