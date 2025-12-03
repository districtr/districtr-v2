import {AlertDialog, Button, Flex} from '@radix-ui/themes';
import React from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';

export const ResetMapButton: React.FC<{dialogOnly?: boolean}> = ({dialogOnly}) => {
  const noZonesAreAssigned = useAssignmentsStore(state => !state.zoneAssignments.size);
  const access = useMapStore(state => state.mapStatus?.access);
  const handleReset = useMapStore(state => state.handleReset);
  const handleClickResetMap = () => {
    clear();
    handleReset();
  };

  return (
    <AlertDialog.Root defaultOpen={dialogOnly}>
      {!dialogOnly && (
        <AlertDialog.Trigger disabled={noZonesAreAssigned || access === 'read'}>
          <Button variant="outline">Reset Map</Button>
        </AlertDialog.Trigger>
      )}
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
};
