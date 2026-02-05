import {MapStore} from '@/app/store/mapStore';
import {Box, Flex, RadioGroup, Text} from '@radix-ui/themes';
import React from 'react';
import {ColorPickerProps} from './ColorPicker';
import {styled} from '@stitches/react';

const StyledRadioGroupItem = styled(RadioGroup.Item, {
  borderRadius: 8,
  width: '1.25rem',
  height: '1.25rem',
  border: 'var(--border-width) solid var(--gray-200)',
  '&::after': {
    borderRadius: 8,
    width: '1.25rem',
    height: '1.25rem',
  },
  '&::before': {
    borderRadius: 8,
    background: 'none',
    width: '1.25rem',
    height: '1.25rem',
  },
});

export const ColorRadioGroup: React.FC<{
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
    <Box>
      <RadioGroup.Root
        onValueChange={value => {
          const index = colorScheme.indexOf(value);
          if (index !== -1) onValueChange(index, value);
        }}
        value={value !== undefined ? colorScheme[value] : undefined}
        defaultValue={colorScheme[defaultValue]}
      >
        <Flex direction="row" wrap="wrap" gapX="2">
          {!!mapDocument &&
            colorScheme.slice(0, numDistricts).map((color, i) => (
              <Flex direction="column" align="center" key={i} pb="2">
                <StyledRadioGroupItem
                  key={i}
                  data-testid={`zone-${i + 1}`}
                  style={{backgroundColor: color}}
                  value={color}
                  disabled={disabledValues?.includes(i)}
                  className={disabledValues?.includes(i) ? 'opacity-25' : ''}
                ></StyledRadioGroupItem>
                <Text size="1">{i + 1}</Text>
              </Flex>
            ))}
        </Flex>
      </RadioGroup.Root>
    </Box>
  );
};
