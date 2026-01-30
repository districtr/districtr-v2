import {Button, Box} from '@radix-ui/themes';
import {useMapStore} from '../../store/mapStore';
import {useMapControlsStore} from '../../store/mapControlsStore';
import {ColorPicker} from './ColorPicker';
import {LockClosedIcon, LockOpen2Icon} from '@radix-ui/react-icons';
import { useColorScheme } from '@/app/hooks/useColorScheme';

export function ZoneLockPicker() {
  const lockedZones = useMapControlsStore(state => state.mapOptions.lockPaintedAreas);
  const mapDocument = useMapStore(state => state.mapDocument);
  const colorScheme = useColorScheme();
  const access = useMapStore(state => state.mapStatus?.access);
  const numDistricts = mapDocument?.num_districts || 40;
  const allDistrictsNumbers = new Array(numDistricts).fill(null).map((_, i) => i + 1);
  const pickerValue = Array.isArray(lockedZones)
    ? lockedZones.map(f => (null === f ? 0 : f - 1))
    : lockedZones === true
      ? colorScheme.map((_, i) => i)
      : [];

  const setLockedZones = useMapControlsStore(state => state.setLockedZones);

  const handleChange = (indices: number[], _colors: string[]) => {
    const zoneValues = indices.map(v => v + 1);
    setLockedZones(zoneValues);
  };
  const lockAll = () => setLockedZones(allDistrictsNumbers);
  const unlockAll = () => setLockedZones([]);

  return (
    <Box className={access === 'read' ? 'pointer-events-none opacity-50' : ''}>
      <ColorPicker onValueChange={handleChange} defaultValue={[]} value={pickerValue} multiple />
      <Button onClick={lockAll} mr="2" mt="2" variant="outline" disabled={access === 'read'}>
        <LockClosedIcon />
        Lock all
      </Button>
      <Button onClick={unlockAll} mt="2" variant="outline" disabled={access === 'read'}>
        <LockOpen2Icon />
        Unlock all
      </Button>
    </Box>
  );
}
