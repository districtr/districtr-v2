'use client';
import {AlertDialog, Button, Flex} from '@radix-ui/themes';
import {useMapStore} from '@store/mapStore';
import {useZoneOrder} from '@/app/hooks/useZoneLabel';
import {renumberForOrder} from '@utils/zoneLabels';

/** Shown once the panel order differs from the district numbers: makes each
 * district's number its place in the panel, after a confirmation. */
export const RenumberToOrderButton: React.FC = () => {
  const zoneOrder = useZoneOrder();
  const renumberToPanelOrder = useMapStore(state => state.renumberToPanelOrder);
  const mapLock = useMapStore(state => state.mapLock);
  if (!renumberForOrder(zoneOrder).size) return null;
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger>
        <Button size="1" variant="surface" color="gray" disabled={!!mapLock}>
          Renumber in this order
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Content maxWidth="450px">
        <AlertDialog.Title>Renumber districts</AlertDialog.Title>
        <AlertDialog.Description size="2">
          Each district takes the number of its place in this list, so the first row becomes
          district 1. Colors, labels, descriptions and locks stay with their districts; a label that
          was just the old number becomes the new one. This clears undo history.
        </AlertDialog.Description>
        <Flex gap="3" mt="4" justify="end">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action>
            <Button variant="solid" onClick={renumberToPanelOrder}>
              Renumber
            </Button>
          </AlertDialog.Action>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
};
