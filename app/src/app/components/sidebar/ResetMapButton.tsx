import {useMapStore} from '@/app/store/mapStore';
import {AlertDialog, Button, Flex} from '@radix-ui/themes';

export function ResetMapButton() {
  const handleClickResetMap = useMapStore(state => state.handleReset);
  const noZonesAreAssigned = useMapStore(state => !state.zoneAssignments.size);

  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger disabled={noZonesAreAssigned}>
        <Button color="red">Reset Map</Button>
      </AlertDialog.Trigger>
      <AlertDialog.Content maxWidth="450px">
        <AlertDialog.Title>Reset Map</AlertDialog.Title>
        <AlertDialog.Description size="2">
          Are you sure? This will reset all zone assignments and broken geographies. Resetting your
          map cannot be undone.
        </AlertDialog.Description>

        <Flex gap="3" mt="4" justify="end">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action>
            <Button variant="solid" color="red" onClick={handleClickResetMap}>
              Reset Map
            </Button>
          </AlertDialog.Action>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
