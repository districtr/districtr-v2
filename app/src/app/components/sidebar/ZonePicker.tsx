import React, {useState} from 'react';
import {colorScheme} from '../../constants/colors';
import {Button} from '@radix-ui/themes';
import {styled} from '@stitches/react';
import * as RadioGroup from '@radix-ui/react-radio-group';
import {blackA} from '@radix-ui/colors';
import {useMapStore} from '../../store/mapStore';
import {ColorPicker} from './ColorPicker';

export function ZonePicker() {
  const selectedZone = useMapStore(state => state.selectedZone);
  const setSelectedZone = useMapStore(state => state.setSelectedZone);
  const accumulatedGeoids = useMapStore(state => state.accumulatedGeoids);
  const resetAccumulatedBlockPopulations = useMapStore(
    state => state.resetAccumulatedBlockPopulations
  );

  const handleRadioChange = (index: number, _color: string) => {
    const value = index + 1;
    setSelectedZone(value);
    // resetAccumulatedBlockPopulations();
  };

  return (
    <div>
      <ColorPicker
        onValueChange={handleRadioChange}
        colorArray={colorScheme}
        defaultValue={0}
        value={selectedZone - 1}
      />
    </div>
  );
}

const StyledColorPicker = styled(Button, {
  width: 25,
  height: 25,
  borderRadius: 10,
  margin: 5,
  '&:selected': {
    border: '2px solid',
  },
});

const RadioGroupItem = styled(RadioGroup.Item, {
  width: 20,
  height: 20,
  '&:hover': {backgroundColor: blackA.blackA4},
  '&:focus': {boxShadow: `0 0 0 2px black`},
  margin: 2.5,
  alignItems: 'center',
  border: '1px solid #ccc',
  borderRadius: '8px',
  cursor: 'pointer',
});

const RadioGroupIndicator = styled(RadioGroup.Indicator, {
  // display: "flex",
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  position: 'relative',
  textAlign: '-webkit-center',
  '&::after': {
    content: '""',
    display: 'block',
    width: 7,
    height: 7,
    borderRadius: '50%',
    backgroundColor: '#fff',
  },
});

const RadioGroupRoot = styled(RadioGroup.Root, {});
