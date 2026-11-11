import {MapStore} from '@/app/store/mapStore';
import {Box, Flex, Kbd, RadioGroup, Text, Tooltip} from '@radix-ui/themes';
import {useAltHeld} from '@/app/hooks/useAltHeld';
import React from 'react';
import {ColorPickerProps} from './ColorPicker';
import {isDigitLabel, orderedZoneLabels} from '@/app/utils/zoneLabels';
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
  // each all-digit label renders as a keycap: typing it selects the district,
  // multi-digit labels included (the hotkey accumulator in ColorPicker collects
  // digits, so "1" then "4" selects the district labeled 14).
  const showHotkeyHints = useAltHeld();
  if (!mapDocument?.num_districts) return null;
  const zones = orderedZoneLabels(mapDocument);
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
          {zones.map(({zone, label}) => {
            const i = zone - 1;
            const color = colorScheme[i];
            const disabled = disabledValues?.includes(i);
            // Only all-digit labels have a number-key shortcut.
            const hotkey = showHotkeyHints && !disabled && isDigitLabel(label);
            return (
              <Flex direction="column" align="center" key={zone} pb="2">
                {/* The span takes the Tooltip trigger's data-state, which would
                    otherwise overwrite the item's data-state="checked" and drop
                    its selected style. */}
                <Tooltip content={label}>
                  <span className="inline-flex">
                    <StyledRadioGroupItem
                      data-testid={`zone-${zone}`}
                      aria-label={`District ${label}`}
                      style={{backgroundColor: color}}
                      value={color}
                      disabled={disabled}
                      className={disabled ? 'opacity-25' : ''}
                    ></StyledRadioGroupItem>
                  </span>
                </Tooltip>
                {/* Fixed-height slot so the row doesn't jump when Alt swaps
                    the label for a keycap. */}
                <Flex height="18px" align="center" justify="center" position="relative">
                  {hotkey ? (
                    // Out of layout flow: the keycap is wider than the pip, and
                    // in-flow it would widen the column and shift the row.
                    <Kbd
                      size="1"
                      style={{position: 'absolute', left: '50%', transform: 'translateX(-50%)'}}
                    >
                      {label}
                    </Kbd>
                  ) : (
                    // A long label is cut to the pip's width; the tooltip has it all.
                    <Text
                      size="1"
                      style={{
                        maxWidth: '4ch',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {label}
                    </Text>
                  )}
                </Flex>
              </Flex>
            );
          })}
        </Flex>
      </RadioGroup.Root>
    </Box>
  );
};
