import React, {useEffect, useRef} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {NullableZone} from '@constants/map/zone';
import {isDigitLabel, orderedZoneLabels} from '@/app/utils/zoneLabels';
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
      /** Suppresses the digit-key hotkey alongside the caller's own visual
       * disabling (e.g. pointer-events/opacity) — the two must travel
       * together, or a keyboard digit can still reassign the selection
       * through a picker that reads as inert. */
      disabled?: boolean;
    }
  : {
      defaultValue: number;
      value?: number;
      onValueChange: (i: number, color: string) => void;
      multiple?: false;
      disabledValues?: NullableZone[];
      _colorScheme?: string[];
      disabled?: boolean;
    };

export const ColorPicker = <T extends boolean>({
  defaultValue,
  value,
  onValueChange,
  multiple,
  disabledValues,
  _colorScheme,
  disabled,
}: ColorPickerProps<T>) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const _stateColorScheme = useColorScheme();
  const colorScheme = _colorScheme ?? _stateColorScheme;
  const isDesktop = useIsDesktop();
  const maxInlinePips = isDesktop ? MAX_INLINE_DISTRICT_PIPS : MAX_INLINE_DISTRICT_PIPS_MOBILE;
  const hotkeyRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Number keys select the district whose label is exactly the digits typed;
  // districts with other labels have no shortcut.
  const digitLabelZones = () => {
    const zones = new Map<string, number>();
    for (const {zone, label} of orderedZoneLabels(useMapStore.getState().mapDocument)) {
      if (isDigitLabel(label)) zones.set(label, zone);
    }
    return zones;
  };

  const handleKeyPressSubmit = () => {
    if (!hotkeyRef.current) return;
    const zone = digitLabelZones().get(hotkeyRef.current);
    hotkeyRef.current = null;
    if (zone === undefined) return;
    const index = zone - 1;
    const newValue = colorScheme[index];
    if (multiple) {
    } else {
      onValueChange(index, newValue);
    }
  };

  useEffect(() => {
    // add a listener for option or alt key press and release
    const handleKeyPress = (event: KeyboardEvent) => {
      if (disabled) return;
      const activeElement = document.activeElement;
      // if active element is an input, don't do anything
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
        return;
      // if command/control held down, don't do anything
      if (event.metaKey || event.ctrlKey) return;
      if (!event.code.includes('Digit') || !/^[0-9]$/.test(event.key)) return;
      // Accumulate digits while a longer label starts with them, so "1" then "4"
      // selects the district labeled 14. Otherwise submit right away; a pending
      // prefix submits after the 250ms window.
      const typed = (hotkeyRef.current || '') + event.key;
      hotkeyRef.current = typed;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      const longerLabel = Array.from(digitLabelZones().keys()).some(
        label => label.length > typed.length && label.startsWith(typed)
      );
      if (longerLabel) {
        timeoutRef.current = setTimeout(handleKeyPressSubmit, 250);
      } else {
        handleKeyPressSubmit();
      }
    };

    document.addEventListener('keydown', handleKeyPress);

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [disabled]);

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
