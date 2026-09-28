import {MapStore} from '@/app/store/mapStore';
import {Box, Flex, Kbd, RadioGroup, Text} from '@radix-ui/themes';
import {useAltHeld} from '@/app/hooks/useAltHeld';
import React from 'react';
import {ColorPickerProps} from './ColorPicker';
import {styled} from '@stitches/react';

const StyledRadioGroupItem = styled(RadioGroup.Item, {
  // Bigger below lg: 20px pips are too small a touch target in the mobile dock.
  '--pip-size': '1.25rem',
  '@media (max-width: 1023px)': {'--pip-size': '2.25rem'},
  borderRadius: 8,
  width: 'var(--pip-size)',
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

export const ColorRadioGroup: React.FC<{
  colorScheme: string[];
  mapDocument: MapStore['mapDocument'];
  onValueChange: ColorPickerProps['onValueChange'];
  value: ColorPickerProps['value'];
  defaultValue: ColorPickerProps['defaultValue'];
  disabledValues: ColorPickerProps['disabledValues'];
}> = ({colorScheme, mapDocument, onValueChange, defaultValue, value, disabledValues}) => {
  // While Alt/Option is held (the same reveal as the toolbar's hotkey badges),
  // each pip's number renders as a keycap: typing a district's number selects
  // it, multi-digit numbers included (the hotkey accumulator in ColorPicker
  // collects digits, so "1" then "4" selects 14).
  const showHotkeyHints = useAltHeld();
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
                {/* Fixed-height slot so the row doesn't jump when Alt swaps
                    the label for a keycap. */}
                <Flex height="18px" align="center" justify="center" position="relative">
                  {showHotkeyHints && !disabledValues?.includes(i) ? (
                    // Out of layout flow: the keycap is wider than the pip, and
                    // in-flow it would widen the column and shift the row.
                    <Kbd
                      size="1"
                      style={{position: 'absolute', left: '50%', transform: 'translateX(-50%)'}}
                    >
                      {i + 1}
                    </Kbd>
                  ) : (
                    <Text size="1">{i + 1}</Text>
                  )}
                </Flex>
              </Flex>
            ))}
        </Flex>
      </RadioGroup.Root>
    </Box>
  );
};
