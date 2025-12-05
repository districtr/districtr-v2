import {useState} from 'react';
import {Box, Popover, Button, Flex, Text, IconButton, Inset, Grid, Dialog} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useIdbDocument} from '@/app/hooks/useIdbDocument';
import {CheckIcon, ExclamationTriangleIcon, ResetIcon} from '@radix-ui/react-icons';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';

export const RevertPopover = () => {
  const [hovered, setHovered] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const mapDocument = useMapStore(state => state.mapDocument);
  const documentFromIdb = useIdbDocument(mapDocument?.document_id);
  const isOutdated =
    documentFromIdb?.clientLastUpdated !== documentFromIdb?.document_metadata.updated_at;
  const handleRevert = useAssignmentsStore(state => state.handleRevert);

  const handleConfirmRevert = async () => {
    if (!mapDocument) return;
    setLoading(true);
    try {
      await handleRevert(mapDocument);
    } finally {
      setLoading(false);
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
            <Button
              variant="soft"
              color="gray"
              disabled={loading}
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="solid" color="red" disabled={loading} onClick={handleConfirmRevert}>
              {loading ? 'Reverting...' : 'Revert Changes'}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
};
