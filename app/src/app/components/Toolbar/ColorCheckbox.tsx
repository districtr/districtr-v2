import {MapStore} from '@/app/store/mapStore';
import {Box, Button, CheckboxGroup, Flex, RadioGroup, Text} from '@radix-ui/themes';
import React from 'react';
import {ColorPickerProps} from './ColorPicker';
import {styled} from '@stitches/react';

const StyledCheckboxGroupItem = styled(CheckboxGroup.Item, {
  // Bigger below lg: 20px pips are too small a touch target in the mobile dock.
  '--pip-size': '1.25rem',
  '@media (max-width: 1023px)': {'--pip-size': '2.25rem'},
  borderRadius: 8,
  width: 'var(--pip-size)',
  cursor: 'pointer',
  height: 'var(--pip-size)',
  border: 'var(--border-width) solid var(--gray-200)',
  '&::after': {
    borderRadius: 8,
    width: 'var(--pip-size)',
    height: 'var(--pip-size)',
  },
  '&::before': {
    borderRadius: 8,
    background: 'none',
    width: 'var(--pip-size)',
    height: 'var(--pip-size)',
  },
});

export const ColorCheckbox: React.FC<{
  colorScheme: string[];
  mapDocument: MapStore['mapDocument'];
  onValueChange: (value: number[], colors: string[]) => void;
  value: number[];
  defaultValue: number[];
  disabledValues: ColorPickerProps['disabledValues'];
}> = ({colorScheme, mapDocument, onValueChange, defaultValue, value, disabledValues}) => {
  if (!mapDocument?.num_districts) return null;
  const numDistricts = mapDocument.num_districts;
  return (
    <Box>
      <CheckboxGroup.Root value={value.map(v => `${v}`)}>
        <Flex direction="row" wrap="wrap" gapX="2">
          {!!mapDocument &&
            colorScheme.slice(0, numDistricts).map((color, i) => (
              <Text
                as="label"
                size="2"
                className="cursor-pointer"
                key={i}
                onClick={() => {
                  if (value.includes(i)) {
                    onValueChange(
                      value.filter(v => v !== i),
                      []
                    );
                  } else {
                    onValueChange([...value, i], []);
                  }
                }}
              >
                <Flex direction="column" align="center" pb="2" className="cursor-pointer">
                  <StyledCheckboxGroupItem
                    style={{backgroundColor: color}}
                    value={`${i}`}
                    disabled={disabledValues?.includes(i)}
                    className={disabledValues?.includes(i) ? 'opacity-25' : ''}
                  ></StyledCheckboxGroupItem>
                  <Text size="1">{i + 1}</Text>
                </Flex>
              </Text>
            ))}
        </Flex>
      </CheckboxGroup.Root>
    </Box>
  );
};
