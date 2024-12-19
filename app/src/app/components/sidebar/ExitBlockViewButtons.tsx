import {useMapStore} from '@/app/store/mapStore';
import {Button, Flex} from '@radix-ui/themes';

export function ExitBlockViewButtons() {
  const captiveIds = useMapStore(store => store.captiveIds);
  const exitBlockView = useMapStore(store => store.exitBlockView);

  return captiveIds.size ? (
    <Flex mt={"1"} pt="1" className='border-black borer-t-2' direction={"column"} gap="2">
      <Button onClick={() => exitBlockView()} variant={'solid'}>
        Return to Districts
      </Button>
      <Button onClick={() => exitBlockView(true)} variant={'surface'}>
        Lock & Return to Districts
      </Button>
    </Flex>
  ) : null;
}
