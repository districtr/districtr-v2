import {useMapStore} from '@/app/store/mapStore';
import {Button} from '@radix-ui/themes';

export function ExitBlockViewButtons() {
  const captiveIds = useMapStore(store => store.captiveIds);
  const exitBlockView = useMapStore(store => store.exitBlockView);

  return captiveIds.size ? (
    <>
      <Button onClick={() => exitBlockView()} variant={'solid'}>
        Return to Districts
      </Button>
      <Button onClick={() => exitBlockView(true)} variant={'surface'}>
        Lock & Return to Districts
      </Button>
    </>
  ) : null;
}
