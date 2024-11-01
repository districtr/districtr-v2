import {useMapStore} from '@/app/store/mapStore';
import {Button} from '@radix-ui/themes';

export function ExitShatterButton() {
  const captiveIds = useMapStore(store => store.captiveIds);
  const resetShatterView = useMapStore(store => store.resetShatterView);

  return captiveIds.size ? (
    <Button onClick={resetShatterView} variant={'solid'}>
      Close Shatter Mode
    </Button>
  ) : null;
}
