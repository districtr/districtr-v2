import React from 'react';
import {colorScheme} from '../../constants/colors';
import {useMapStore} from '../../store/mapStore';
import {ColorPicker} from './ColorPicker';

export function ZonePicker() {
  const selectedZone = useMapStore(state => state.selectedZone);
  const setSelectedZone = useMapStore(state => state.setSelectedZone);

  const handleRadioChange = (index: number, _color: string) => {
    const value = index + 1;
    console.log('setting accumulated geoids to old zone', selectedZone, 'new zone is', value);
    setSelectedZone(value);
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
