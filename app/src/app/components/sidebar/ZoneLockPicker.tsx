import React, {useState} from 'react';
import {colorScheme} from '../../constants/colors';
import {Button} from '@radix-ui/themes';
import {styled} from '@stitches/react';
import * as RadioGroup from '@radix-ui/react-radio-group';
import {blackA} from '@radix-ui/colors';
import {useMapStore} from '../../store/mapStore';
import {ColorPicker} from './ColorPicker';

export function ZoneLockPicker() {
  const lockedZones = useMapStore(state => state.mapOptions.lockPaintedAreas);
  const pickerValue = Array.isArray(lockedZones)
    ? lockedZones.map(f => null === f ? 0 : f - 1)
    : lockedZones === true
    ? colorScheme.map((_,i) => i)
    : [];

  const setLockedZones = useMapStore(state => state.setLockedZones);

  const handleChange = (indices: number[], _colors: string[]) => {
    const zoneValues = indices.map(v => v + 1);
    setLockedZones(zoneValues);
  };

  return (
    <div>
      <ColorPicker
        onValueChange={handleChange}
        colorArray={colorScheme}
        defaultValue={[]}
        value={pickerValue}
        multiple
      />
    </div>
  );
}
