import React, {useEffect, useRef} from 'react';
import {Button, CheckboxGroup, Flex, Text} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {extendColorArray} from '@/app/utils/colors';
import {NullableZone} from '@/app/constants/types';
import {FALLBACK_NUM_DISTRICTS} from '@/app/constants/layers';
import {ColorRadioGroup} from './ColorRadioGroup';
import {ColorDropdown} from './ColorDropdown';

export type ColorPickerProps<T extends boolean = false> = T extends true
  ? {
      defaultValue: number[];
      value?: number[];
      onValueChange: (indices: number[], color: string[]) => void;
      multiple: true;
      disabledValues?: NullableZone[];
    }
  : {
      defaultValue: number;
      value?: number;
      onValueChange: (i: number, color: string) => void;
      multiple?: false;
      disabledValues?: NullableZone[];
    };

export const ColorPicker = <T extends boolean>({
  defaultValue,
  value,
  onValueChange,
  multiple,
  disabledValues,
}: ColorPickerProps<T>) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const colorScheme = useMapStore(state => state.colorScheme);
  const hotkeyRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const numDistricts = mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS;
  const colorArray =
    numDistricts > colorScheme.length ? extendColorArray(colorScheme, numDistricts) : colorScheme;

  const handleKeyPressSubmit = () => {
    if (!hotkeyRef.current) return;
    const index = parseInt(hotkeyRef.current) - 1;
    const newValue = colorScheme[index];
    hotkeyRef.current = null;
    if (multiple) {
      console.log('!!!', defaultValue, value, newValue);
    } else {
      onValueChange(index, newValue);
    }
  };

  useEffect(() => {
    // add a listener for option or alt key press and release
    const handleKeyPress = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      // if active element is an input, don't do anything
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
        return;
      // if command/control held down, don't do anything
      if (event.metaKey || event.ctrlKey) return;
      // if key is digit, set selected zone to that digit
      if (!event.code.includes('Digit')) return;
      let value = event.key;
      if (numDistricts >= 10) {
        hotkeyRef.current = (hotkeyRef.current || '') + value;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (hotkeyRef?.current?.length === 2) {
          handleKeyPressSubmit();
        } else {
          timeoutRef.current = setTimeout(() => {
            handleKeyPressSubmit();
          }, 250);
        }
      } else {
        hotkeyRef.current = value;
        handleKeyPressSubmit();
      }
    };

    document.addEventListener('keydown', handleKeyPress);

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  if (multiple) {
    return (
      <div>
        <CheckboxGroupRoot
          defaultValue={defaultValue.map(i => colorScheme[i])}
          value={value?.map(i => colorScheme[i]) || []}
          onValueChange={values => {
            const indices = values.map(f => colorScheme.indexOf(f));
            onValueChange(indices, values);
          }}
          style={{
            justifyContent: 'flex-start',
          }}
        >
          <Flex direction="row" wrap="wrap">
            {!!mapDocument &&
              colorScheme.slice(0, numDistricts).map((color, i) => (
                <Flex direction="column" align="center" key={i}>
                  <CheckboxGroupItem
                    key={i}
                    disabled={disabledValues?.includes(i)}
                    // @ts-ignore Correct behavior, global CSS variables need to be extended
                    style={{'--accent-indicator': color}}
                    value={color}
                  >
                    {/* <RadioGroupIndicator /> */}
                  </CheckboxGroupItem>
                  <Text size="1">{i + 1}</Text>
                </Flex>
              ))}
          </Flex>
        </CheckboxGroupRoot>
      </div>
    );
  }
  if (mapDocument?.num_districts! > 10) {
    return (
      <ColorDropdown
        colorScheme={colorScheme}
        mapDocument={mapDocument}
        onValueChange={onValueChange}
        value={value}
        defaultValue={defaultValue}
        disabledValues={disabledValues}
      />
    );
  } else {
    return (
      <ColorRadioGroup
        colorScheme={colorScheme}
        mapDocument={mapDocument}
        onValueChange={onValueChange}
        value={value}
        defaultValue={defaultValue}
        disabledValues={disabledValues}
      />
    );
  }
};