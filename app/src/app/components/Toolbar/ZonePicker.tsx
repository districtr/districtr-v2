import React from 'react';
import {Box} from '@radix-ui/themes';
import {useMapStore} from '../../store/mapStore';
import {ColorPicker} from './ColorPicker';

export function ZonePicker() {
  const selectedZone = useMapStore(state => state.selectedZone);
  const setSelectedZone = useMapStore(state => state.setSelectedZone);
  const access = useMapStore(state => state.mapStatus?.access);

  const handleRadioChange = (index: number, _color: string) => {
    const value = index + 1;
    console.log('setting accumulated geoids to old zone', selectedZone, 'new zone is', value);
    setSelectedZone(value);
  };

  return (
    <Box className={access === 'read' ? 'pointer-events-none opacity-50' : ''}>
      <ColorPicker onValueChange={handleRadioChange} defaultValue={0} value={selectedZone - 1} />
    </Box>
  );
}
