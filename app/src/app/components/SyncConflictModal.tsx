import React from 'react';
import {Dialog, Button, Flex, Text, Box} from '@radix-ui/themes';
import {Cross2Icon} from '@radix-ui/react-icons';
import {
  SyncConflictResolution,
  SyncConflictInfo,
} from '@/app/utils/api/apiHandlers/fetchDocumentWithSync';
import {DocumentObject} from '@/app/utils/api/apiHandlers/types';

interface SyncConflictModalProps {
  open: boolean;
  conflict: SyncConflictInfo;
  onResolve: (resolution: SyncConflictResolution) => void;
}

export const SyncConflictModal: React.FC<SyncConflictModalProps> = ({
  open,
  conflict,
  onResolve,
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
        <Box p="3">
          <Text size="3" className="block mb-4">
            Both the local and server versions of this document have been updated. Please choose how
            to resolve this conflict:
          </Text>

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
              Server Version
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
            <Button
              onClick={() => onResolve('use-server')}
              variant="solid"
              className="w-full"
              size="3"
            >
              Use Server Version (Overwrite Local)
            </Button>
            <Button
              onClick={() => onResolve('use-local')}
              variant="solid"
              className="w-full"
              size="3"
            >
              Use Local Version (Overwrite Server)
            </Button>
            <Button onClick={() => onResolve('fork')} variant="solid" className="w-full" size="3">
              Create Copy/Fork (Keep Both Versions)
            </Button>
            <Button
              onClick={() => onResolve('keep-local')}
              variant="outline"
              className="w-full"
              size="3"
            >
              Keep Working on Local (Don't Sync)
            </Button>
          </Flex>
        </Box>
      </Dialog.Content>
    </Dialog.Root>
  );
};
