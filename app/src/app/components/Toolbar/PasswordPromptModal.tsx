import {useMapStore} from '@/app/store/mapStore';
import React, {useEffect} from 'react';
import {Cross2Icon} from '@radix-ui/react-icons';
import {Button, Flex, Text, Dialog, Box, TextField} from '@radix-ui/themes';
import {sharedDocument} from '@/app/utils/api/mutations';
import {useShareJwt} from '@/app/hooks/useShareJwt';

export const PasswordPromptModal = () => {
  const passwordRequired = useMapStore(store => store.passwordPrompt);
  const [dialogOpen, setDialogOpen] = React.useState(passwordRequired);
  const [password, setPassword] = React.useState<string | null>(null);
  const shareMapMessage = useMapStore(store => store.shareMapMessage);
  const receivedShareToken = useMapStore(store => store.receivedShareToken ?? '');
  const shareToken = useShareJwt();

  useEffect(() => {
    setDialogOpen(passwordRequired);
  }, [passwordRequired]);

  const handleProceed = (editAccess: boolean) => {
    shareToken &&
      sharedDocument.mutate({
        token: receivedShareToken,
        password: password,
        access: editAccess ? shareToken.access : 'read',
        status: null,
      });
  };

  return (
    <Dialog.Root
      open={dialogOpen}
      onOpenChange={open => {
        if (!open) {
          handleProceed(false);
          setPassword(null);
          setDialogOpen(false);
        }
      }}
    >
      <Dialog.Content>
        <Flex align="center" className="mb-4">
          <Dialog.Title className="m-0 text-xl font-bold flex-1">Password Required</Dialog.Title>
          <Dialog.Close
            className="rounded-full size-[24px] hover:bg-red-100 p-1"
            aria-label="Close"
            onClick={() => handleProceed(false)}
          >
            <Cross2Icon />
          </Dialog.Close>
        </Flex>
        <Box p="3">
          <Text size="2" weight="bold">
            This plan is password protected.{' '}
          </Text>
          <Text size="3">Please enter a valid password to access this plan</Text>

          <TextField.Root
            placeholder="Password"
            size="3"
            type="password"
            value={password ?? undefined}
            onChange={e => setPassword(e.target.value || null)}
          ></TextField.Root>
          <Flex gap="2" py="2">
            <Button onClick={() => handleProceed(true)}>Submit</Button>
            <Button onClick={() => handleProceed(false)}>Cancel and Proceed to Map</Button>
          </Flex>
          <Text>{shareMapMessage ?? ''}</Text>
        </Box>
      </Dialog.Content>
    </Dialog.Root>
  );
};
