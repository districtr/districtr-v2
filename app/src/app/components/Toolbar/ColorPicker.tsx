import React, {useEffect, useRef} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {NullableZone} from '@constants/map/zone';
import {FALLBACK_NUM_DISTRICTS} from '@/app/constants/map/layerStyle';
import {ColorRadioGroup} from './ColorRadioGroup';
import {ColorDropdown} from './ColorDropdown';
import {ColorMultiDropdown} from './ColorMultiDropdown';
import {ColorCheckbox} from './ColorCheckbox';
import {colorScheme as DefaultColorScheme} from '@/app/constants/colors';
import {useColorScheme} from '@/app/hooks/useColorScheme';
import {useIsDesktop} from '@/app/hooks/useIsDesktop';

const MAX_INLINE_DISTRICT_PIPS = 25;
// Swatch grids get cramped in the mobile dock; collapse to the dropdown sooner.
const MAX_INLINE_DISTRICT_PIPS_MOBILE = 10;
export type ColorPickerProps<T extends boolean = false> = T extends true
  ? {
      defaultValue: number[];
      value?: number[];
      onValueChange: (indices: number[], color: string[]) => void;
      multiple: true;
      disabledValues?: NullableZone[];
      _colorScheme?: string[];
    }
  : {
      defaultValue: number;
      value?: number;
      onValueChange: (i: number, color: string) => void;
      multiple?: false;
      disabledValues?: NullableZone[];
      _colorScheme?: string[];
    };

export const ColorPicker = <T extends boolean>({
  defaultValue,
  value,
  onValueChange,
  multiple,
  disabledValues,
  _colorScheme,
}: ColorPickerProps<T>) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const _stateColorScheme = useColorScheme();
  const colorScheme = _colorScheme ?? _stateColorScheme;
  const isDesktop = useIsDesktop();
  const maxInlinePips = isDesktop ? MAX_INLINE_DISTRICT_PIPS : MAX_INLINE_DISTRICT_PIPS_MOBILE;
  const hotkeyRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleKeyPressSubmit = () => {
    if (!hotkeyRef.current) return;
    const index = parseInt(hotkeyRef.current) - 1;
    hotkeyRef.current = null;
    const numDistricts =
      useMapStore.getState().mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS;
    if (index < 0 || index >= numDistricts) return;
    const newValue = colorScheme[index];
    if (multiple) {
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
      const numDistricts =
        useMapStore.getState().mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS;
      const numDigits = numDistricts.toString().length;
      if (numDistricts >= MAX_INLINE_DISTRICT_PIPS) {
        hotkeyRef.current = (hotkeyRef.current || '') + value;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (hotkeyRef?.current?.length === numDigits) {
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
    if (mapDocument?.num_districts! > maxInlinePips) {
      return (
        <ColorMultiDropdown
          colorScheme={colorScheme}
          mapDocument={mapDocument}
          onValueChange={onValueChange}
          value={value ?? []}
          defaultValue={defaultValue}
          disabledValues={disabledValues}
        />
      );
    } else {
      return (
        <ColorCheckbox
          colorScheme={colorScheme}
          mapDocument={mapDocument}
          onValueChange={onValueChange}
          value={value ?? []}
          defaultValue={[]}
          disabledValues={disabledValues}
        />
      );
    }
  }

  if (mapDocument?.num_districts! > maxInlinePips) {
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
