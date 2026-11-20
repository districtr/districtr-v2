import {MapStore} from '@/app/store/mapStore';
import {Box, Flex, RadioGroup, Select, Text} from '@radix-ui/themes';
import React from 'react';
import {ColorPickerProps} from './ColorPicker';
import {orderedZoneLabels} from '@/app/utils/zoneLabels';

export const ColorDropdown: React.FC<{
  colorScheme: string[];
  mapDocument: MapStore['mapDocument'];
  onValueChange: ColorPickerProps['onValueChange'];
  value: ColorPickerProps['value'];
  defaultValue: ColorPickerProps['defaultValue'];
  disabledValues: ColorPickerProps['disabledValues'];
}> = ({colorScheme, mapDocument, onValueChange, defaultValue, value, disabledValues}) => {
  if (!mapDocument?.num_districts) return null;
  const zones = orderedZoneLabels(mapDocument);
  const selected = value ?? defaultValue;
  return (
    <Flex direction="row" gapX="3" align="center">
      <Text size="1">District</Text>
      <Select.Root
        // Keyed by district index, not color: districts may share a color.
        onValueChange={value => onValueChange(+value, colorScheme[+value])}
        value={value !== undefined ? String(value) : undefined}
      >
        <Select.Trigger variant="ghost">
          <Flex direction={'row'} gapX="2">
            <Box
              style={{backgroundColor: colorScheme[selected]}}
              width={'1rem'}
              height={'1rem'}
              className="rounded-lg"
            />
            <Text size="1">{zones.find(z => z.zone === selected + 1)?.label}</Text>
          </Flex>
        </Select.Trigger>
        <Select.Content>
          {zones.map(({zone, label}) => (
            <Select.Item key={zone} value={String(zone - 1)}>
              <Flex direction={'row'} gapX="2">
                <Box
                  style={{backgroundColor: colorScheme[zone - 1]}}
                  width={'1rem'}
                  height={'1rem'}
                  className="rounded-lg"
                />
                <Text size="1">{label}</Text>
              </Flex>
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </Flex>
  );
};
