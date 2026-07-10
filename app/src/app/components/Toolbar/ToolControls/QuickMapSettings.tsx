import React from 'react';
import {Button, CheckboxGroup, Flex, Popover} from '@radix-ui/themes';
import {CaretDownIcon, MixerHorizontalIcon} from '@radix-ui/react-icons';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import type {DistrictrMapOptions} from '@store/types';

// The key display toggles, colocated with the paint controls in Draw mode and
// tucked in a dropdown to save vertical space. State is shared with the
// settings dialog. Painted-districts visibility lives with the choropleth
// controls, and the noisy per-unit population labels stay in Visual settings.
const QUICK_TOGGLES: Array<{key: keyof DistrictrMapOptions; label: string}> = [
  {key: 'showZoneNumbers', label: 'Show district numbers'},
  {key: 'higlightUnassigned', label: 'Highlight unassigned areas'},
  {key: 'showPopulationTooltip', label: 'Show population tooltip'},
];

export const QuickMapSettings: React.FC = () => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);

  return (
    <Popover.Root>
      <Popover.Trigger>
        <Button variant="surface" color="gray" size="1" className="self-start cursor-pointer">
          <MixerHorizontalIcon />
          Map display
          <CaretDownIcon />
        </Button>
      </Popover.Trigger>
      <Popover.Content size="1">
        <CheckboxGroup.Root
          size="2"
          name="quick-map-settings"
          value={[
            ...QUICK_TOGGLES.filter(t => mapOptions[t.key] === true).map(t => t.key),
            mapOptions.showCountyBoundaries === true ? 'showCountyBoundaries' : '',
          ]}
        >
          <Flex direction="column" gap="2">
            {QUICK_TOGGLES.map(toggle => (
              <CheckboxGroup.Item
                key={toggle.key}
                value={toggle.key}
                disabled={mapDocument === null}
                onClick={() => setMapOptions({[toggle.key]: !mapOptions[toggle.key]})}
              >
                {toggle.label}
              </CheckboxGroup.Item>
            ))}
            <CheckboxGroup.Item
              value="showCountyBoundaries"
              onClick={() =>
                setMapOptions({
                  showCountyBoundaries: !mapOptions.showCountyBoundaries,
                  prominentCountyNames: !mapOptions.showCountyBoundaries,
                })
              }
            >
              Show county boundaries
            </CheckboxGroup.Item>
          </Flex>
        </CheckboxGroup.Root>
      </Popover.Content>
    </Popover.Root>
  );
};
