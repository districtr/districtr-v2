import React from 'react';
import {Checkbox, Flex, Text} from '@radix-ui/themes';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useMapStore} from '@store/mapStore';
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

  return (
    /* Labelled as actions ("Show …", "Disallow …") rather than nouns, so each
       row states what checking it does. Ordered by how consequential the
       setting is: painting behavior first, then display. */
    <Flex direction="column" gap="2">
      <DisallowPaintOver size="3" />
      <Text
        as="label"
        size="3"
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
          Show pop on hover
        </Flex>
      </Text>
      <Text as="label" size="3" className="cursor-pointer select-none">
        <Flex gap="2" align="center">
          <Checkbox
            checked={mapOptions.showZoneNumbers === true}
            onCheckedChange={() => setMapOptions({showZoneNumbers: !mapOptions.showZoneNumbers})}
          />
          Show district numbers
        </Flex>
      </Text>
    </Flex>
  );
};
