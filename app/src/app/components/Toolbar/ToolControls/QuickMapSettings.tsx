import React from 'react';
import {CheckboxGroup, Text} from '@radix-ui/themes';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import type {DistrictrMapOptions} from '@store/types';

// The key display toggles, colocated with the paint controls in Draw mode so
// they aren't buried in the settings dialog. State is shared with ToolSettings.
const QUICK_TOGGLES: Array<{key: keyof DistrictrMapOptions; label: string}> = [
  {key: 'showPaintedDistricts', label: 'Show painted districts'},
  {key: 'showZoneNumbers', label: 'Show district numbers'},
  {key: 'higlightUnassigned', label: 'Highlight unassigned areas'},
  {key: 'showPopulationTooltip', label: 'Show population tooltip'},
  {key: 'showPopulationNumbers', label: 'Show population on map (all units)'},
];

export const QuickMapSettings: React.FC = () => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);

  return (
    <CheckboxGroup.Root
      size="1"
      name="quick-map-settings"
      value={[
        ...QUICK_TOGGLES.filter(t => mapOptions[t.key] === true).map(t => t.key),
        mapOptions.showCountyBoundaries === true ? 'showCountyBoundaries' : '',
      ]}
    >
      <Text size="1" weight="bold" mt="1">
        Map display
      </Text>
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
    </CheckboxGroup.Root>
  );
};
