import {useMapStore} from '@/app/store/mapStore';
import {Button} from '@radix-ui/themes';

export function ResetMapButton() {
  const handleClickResetMap = useMapStore(state => state.handleReset)

  return (
    <Button onClick={handleClickResetMap} variant={'outline'} disabled>
      Reset Map
    </Button>
  );
}
