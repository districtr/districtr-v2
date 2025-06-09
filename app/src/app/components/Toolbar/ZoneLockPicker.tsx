import React from 'react';
import {Button} from '@radix-ui/themes';
import {useMapStore} from '../../store/mapStore';
import {ColorPicker} from './ColorPicker';
import {LockClosedIcon, LockOpen2Icon} from '@radix-ui/react-icons';

export function ZoneLockPicker() {
  const lockedZones = useMapStore(state => state.mapOptions.lockPaintedAreas);
  const mapDocument = useMapStore(state => state.mapDocument);
  const colorScheme = useMapStore(state => state.colorScheme);
  const access = useMapStore(state => state.mapStatus?.access);
  const numDistricts = mapDocument?.num_districts || 40;
  const allDistrictsNumbers = new Array(numDistricts).fill(null).map((_, i) => i + 1);
  const pickerValue = Array.isArray(lockedZones)
    ? lockedZones.map(f => (null === f ? 0 : f - 1))
    : lockedZones === true
      ? colorScheme.map((_, i) => i)
      : [];

  const setLockedZones = useMapStore(state => state.setLockedZones);

  const handleChange = (indices: number[], _colors: string[]) => {
    const zoneValues = indices.map(v => v + 1);
    setLockedZones(zoneValues);
  };
  const lockAll = () => setLockedZones(allDistrictsNumbers);
  const unlockAll = () => setLockedZones([]);

  return (
    <div style={access === 'read' ? {pointerEvents: 'none', opacity: 0.5} : {}}>
      <ColorPicker onValueChange={handleChange} defaultValue={[]} value={pickerValue} multiple />
      <Button onClick={lockAll} mr="2" mt="2" variant="outline" disabled={access === 'read'}>
        <LockClosedIcon />
        Lock all
      </Button>
      <Button onClick={unlockAll} mt="2" variant="outline" disabled={access === 'read'}>
        <LockOpen2Icon />
        Unlock all
      </Button>
    </div>
  );
}
