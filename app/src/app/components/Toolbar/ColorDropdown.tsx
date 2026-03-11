import {MapStore} from '@/app/store/mapStore';
import {Box, Flex, RadioGroup, Select, Text} from '@radix-ui/themes';
import React from 'react';
import {ColorPickerProps} from './ColorPicker';

export const ColorDropdown: React.FC<{
  colorScheme: string[];
  mapDocument: MapStore['mapDocument'];
  onValueChange: ColorPickerProps['onValueChange'];
  value: ColorPickerProps['value'];
  defaultValue: ColorPickerProps['defaultValue'];
  disabledValues: ColorPickerProps['disabledValues'];
}> = ({colorScheme, mapDocument, onValueChange, defaultValue, value, disabledValues}) => {
  if (!mapDocument?.num_districts) return null;
  const numDistricts = mapDocument.num_districts;
  return (
    <Flex direction="row" gapX="3" align="center">
      <Text size="1">District</Text>
      <Select.Root
        onValueChange={value => {
          const index = colorScheme.indexOf(value);
          if (index !== -1) onValueChange(index, value);
        }}
        value={value !== undefined ? colorScheme[value] : undefined}
      >
        <Select.Trigger variant="ghost">
          <Flex direction={'row'} gapX="2">
            <Box
              style={{backgroundColor: colorScheme[value || defaultValue]}}
              width={'1rem'}
              height={'1rem'}
              className="rounded-lg"
            />
            <Text size="1">{(value || defaultValue) + 1}</Text>
          </Flex>
        </Select.Trigger>
        <Select.Content>
          {colorScheme.slice(0, numDistricts).map((color, i) => (
            <Select.Item key={i} value={color}>
              <Flex direction={'row'} gapX="2">
                <Box
                  style={{backgroundColor: colorScheme[i]}}
                  width={'1rem'}
                  height={'1rem'}
                  className="rounded-lg"
                />
                <Text size="1">{i + 1}</Text>
              </Flex>
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </Flex>
  );
};
