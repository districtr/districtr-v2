import React from 'react';
import {Dialog, Button, Flex, Text, Box, Spinner, Grid} from '@radix-ui/themes';
import {Cross2Icon} from '@radix-ui/react-icons';
import {SyncConflictResolution, SyncConflictInfo} from '@/app/utils/api/apiHandlers/fetchDocument';
import {CloudIcon, LocalIcon, ForkIcon} from './SyncConflictModalIcons';

interface SyncConflictModalProps {
  open: boolean;
  conflict: SyncConflictInfo;
  onResolve: (resolution: SyncConflictResolution) => void;
  loading: boolean;
}

export const SyncConflictModal: React.FC<SyncConflictModalProps> = ({
  open,
  conflict,
  onResolve,
  loading,
}) => {
  const localDate = new Date(conflict.localLastUpdated).toLocaleString();
  const serverDate = new Date(conflict.serverLastUpdated).toLocaleString();

  return (
    <Dialog.Root open={open}>
      <Dialog.Content>
        <Flex align="center" className="mb-4">
          <Dialog.Title className="m-0 text-xl font-bold flex-1">
            Sync Conflict Detected
          </Dialog.Title>
          <Dialog.Close
            className="rounded-full size-[24px] hover:bg-red-100 p-1"
            aria-label="Close"
          >
            <Cross2Icon />
          </Dialog.Close>
        </Flex>
        <Box p="0">
          <Text size="3" className="block mb-4">
            You have unsaved changes on your computer.
            <br />
            <br />
            Since you last saved, other users (or you, on another device!) have made changes to this
            map.
            <br />
            <br />
            This map can only have one version. Please choose how to resolve this conflict:
          </Text>

          {loading ? (
            <Box className="flex justify-center items-center w-full h-20">
              <Spinner />
            </Box>
          ) : (
            <>
              <Box className="mb-4 p-3 bg-gray-50 rounded">
                <Text size="2" weight="bold" className="block mb-2">
                  Local Version
                </Text>
                <Text size="2" className="block mb-1">
                  Last updated: {localDate}
                </Text>
                {conflict.localDocument.map_metadata?.name && (
                  <Text size="2" className="block">
                    Name: {conflict.localDocument.map_metadata.name}
                  </Text>
                )}
              </Box>

              <Box className="mb-4 p-3 bg-gray-50 rounded">
                <Text size="2" weight="bold" className="block mb-2">
                  Cloud Version
                </Text>
                <Text size="2" className="block mb-1">
                  Last updated: {serverDate}
                </Text>
                {conflict.serverDocument.map_metadata?.name && (
                  <Text size="2" className="block">
                    Name: {conflict.serverDocument.map_metadata.name}
                  </Text>
                )}
              </Box>

              <Flex gap="2" direction="column" className="mt-4">
                <Grid columns="3" gap="2">
                  <Button
                    onClick={() => onResolve('use-server')}
                    variant="solid"
                    className="w-full h-auto py-4"
                    size="3"
                  >
                    <Flex direction="column" align="center" gap="2">
                      <CloudIcon />
                      <Text size="2">Use the cloud version (overwrite my plan)</Text>
                    </Flex>
                  </Button>
                  <Button
                    onClick={() => onResolve('use-local')}
                    variant="solid"
                    className="w-full h-auto py-4"
                    size="3"
                  >
                    <Flex direction="column" align="center" gap="2">
                      <LocalIcon />
                      <Text size="2">Use my plan (overwrite the cloud version)</Text>
                    </Flex>
                  </Button>
                  <Button
                    onClick={() => onResolve('fork')}
                    variant="solid"
                    className="w-full h-auto py-4"
                    size="3"
                  >
                    <Flex direction="column" align="center" gap="2">
                      <ForkIcon />
                      <Text size="2">Make my plan a new map (keep both)</Text>
                    </Flex>
                  </Button>
                </Grid>
                <Button
                  onClick={() => onResolve('keep-local')}
                  variant="outline"
                  className="w-full"
                  size="3"
                >
                  I&apos;ll deal with this later
                </Button>
              </Flex>
            </>
          )}
        </Box>
      </Dialog.Content>
    </Dialog.Root>
  );
};
