import {MapStore} from '@/app/store/mapStore';
import {Box, Flex, RadioGroup, Select, Text} from '@radix-ui/themes';
import React from 'react';
import {ColorPickerProps} from './ColorPicker';
import {CheckIcon} from '@radix-ui/react-icons';

export const ColorMultiDropdown: React.FC<{
  colorScheme: MapStore['colorScheme'];
  mapDocument: MapStore['mapDocument'];
  onValueChange: (value: number[], colors: string[]) => void;
  value: number[];
  defaultValue: ColorPickerProps['defaultValue'][];
  disabledValues: ColorPickerProps['disabledValues'];
}> = ({colorScheme, mapDocument, onValueChange, defaultValue, value, disabledValues}) => {
  if (!mapDocument?.num_districts) return null;
  const numDistricts = mapDocument.num_districts;
  return (
    <Flex direction="row" gapX="3" align="center">
      <Select.Root
        value={undefined}
        defaultValue="-1"
        onValueChange={newValue => {
          const indexOfNewValue = colorScheme.indexOf(newValue);
          if (value.includes(indexOfNewValue)) {
            onValueChange(
              value.filter(v => v !== indexOfNewValue),
              []
            );
          } else {
            onValueChange([...value, indexOfNewValue], []);
          }
        }}
      >
        <Select.Trigger variant="ghost">
          <Flex direction={'row'} gapX="2">
            Select Districts
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
                >
                  {value?.includes(i) ? <CheckIcon fontSize={'1'} /> : null}
                </Box>
                <Text size="1">{i + 1}</Text>
              </Flex>
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </Flex>
  );
};
