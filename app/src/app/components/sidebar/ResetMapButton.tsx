import {useMapStore} from '@/app/store/mapStore';
import {Button} from '@radix-ui/themes';

export function ResetMapButton() {
  const handleClickResetMap = useMapStore(state => state.handleReset)
  const noZonesAreAssigned = useMapStore(state => !state.zoneAssignments.size)

  return (
    <Button onClick={handleClickResetMap} variant={'outline'} disabled={noZonesAreAssigned}>
      Reset Map
    </Button>
  );
}
