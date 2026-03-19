import {useState} from 'react';
import {Box, Popover, Button, Flex, Text, IconButton, Inset, Grid, Dialog} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useIdbDocument} from '@/app/hooks/useIdbDocument';
import {CheckIcon, ExclamationTriangleIcon, ResetIcon} from '@radix-ui/react-icons';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';

export const RevertPopover = () => {
  const [hovered, setHovered] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const mapDocument = useMapStore(state => state.mapDocument);
  const documentFromIdb = useIdbDocument(mapDocument?.document_id);
  # TODO: Centralize this in a custom hook
  const districtRevert = useAssignmentsStore(state => state.handleRevert);
  const districtClientLastUpdated = useAssignmentsStore(state => state.clientLastUpdated);
  const coiRevert = useCoiAssignmentsStore(state => state.handleRevert);
  const coiClientLastUpdated = useCoiAssignmentsStore(state => state.clientLastUpdated);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const isCommunity = mapDocument?.map_type === 'community' || mapMode === 'coi';
  const activeClientLastUpdated = isCommunity ? coiClientLastUpdated : districtClientLastUpdated;
  const isOutdated =
    (mapDocument?.updated_at != null &&
      activeClientLastUpdated !== '' &&
      activeClientLastUpdated !== mapDocument.updated_at) ||
    documentFromIdb?.clientLastUpdated !== documentFromIdb?.document_metadata.updated_at;
  const handleRevert = isCommunity ? coiRevert : districtRevert;

  const handleConfirmRevert = async () => {
    if (!mapDocument) return;
    try {
      setModalOpen(false);
      await handleRevert(mapDocument);
    } finally {
      setModalOpen(false);
      setHovered(false);
    }
  };

  return (
    <>
      <Popover.Root open={hovered}>
        <Popover.Trigger>
          <IconButton
            variant="ghost"
            disabled={!isOutdated}
            onClick={() => setModalOpen(true)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={isOutdated ? 'cursor-pointer' : 'cursor-not-allowed'}
            aria-label="Revert changes to server version"
            size="1"
          >
            <ResetIcon color={!isOutdated ? 'gray' : 'blue'} />
          </IconButton>
        </Popover.Trigger>
        <Popover.Content width="320px" align="center">
          <Flex direction="column" align="start" justify="center">
            <Box>
              {!!isOutdated && (
                <Text size="1">
                  Click
                  <Box style={{display: 'inline-block', transform: 'translateY(4px)'}}>
                    <ResetIcon color="red" className="size-5" />
                  </Box>{' '}
                  to <b>revert</b> your changes to the last saved version on the server.
                </Text>
              )}
            </Box>
          </Flex>
        </Popover.Content>
      </Popover.Root>
      {/* Confirmation Modal */}
      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Content style={{maxWidth: 400}}>
          <Dialog.Title>Revert to Last Saved?</Dialog.Title>
          <Dialog.Description>
            This will discard all changes made since your last save, reverting the map to the cloud
            version. <br /> Are you sure you want to proceed?
          </Dialog.Description>
          <Flex justify="end" gap="3" mt="4">
            <Button variant="soft" color="gray" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="solid" color="red" onClick={handleConfirmRevert}>
              Revert Changes
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
};
