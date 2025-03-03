import {useMapStore} from '@/app/store/mapStore';
import React, {useEffect} from 'react';
import {Cross2Icon} from '@radix-ui/react-icons';
import {
  Button,
  Flex,
  Text,
  Table,
  Dialog,
  Box,
  TextField,
  Checkbox,
  IconButton,
  RadioCards,
} from '@radix-ui/themes';
import {sharedDocument} from '@/app/utils/api/mutations';

export const PasswordPromptModal = () => {
  const passwordRequired = useMapStore(store => store.passwordPrompt);
  const [dialogOpen, setDialogOpen] = React.useState(passwordRequired);
  const [password, setPassword] = React.useState<string | null>(null);
  const shareMapMessage = useMapStore(store => store.shareMapMessage);
  const setPasswordPrompt = useMapStore(store => store.setPasswordPrompt);
  const setAppLoadingState = useMapStore(store => store.setAppLoadingState);

  useEffect(() => {
    setDialogOpen(passwordRequired);
  }, [passwordRequired]);

  const handlePasswordSubmit = () => {
    sharedDocument.mutate({
      token: useMapStore.getState().receivedShareToken ?? '',
      password: password,
      status: 'view',
    });
  };

  const handlePasswordEntry = (pw: string) => {
    if (pw) {
      setPassword(pw);
    } else {
      setPassword(null);
    }
  };

  const proceedToStart = () => {
    setPasswordPrompt(false);
    setAppLoadingState('loaded');

    const documentUrl = new URL(window.location.toString());
    documentUrl.searchParams.delete('share'); // remove share + token from url
    history.pushState({}, '', documentUrl.toString());
  };

  return (
    <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
      <Dialog.Content>
        <Flex align="center" className="mb-4">
          <Dialog.Title className="m-0 text-xl font-bold flex-1">Password Required</Dialog.Title>
          <Dialog.Close
            className="rounded-full size-[24px] hover:bg-red-100 p-1"
            aria-label="Close"
            onClick={proceedToStart}
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
            onChange={e => handlePasswordEntry(e.target.value)}
          ></TextField.Root>
          <Flex gap="2" py="2">
            <Button onClick={handlePasswordSubmit}>Submit</Button>
            <Button onClick={proceedToStart}>Cancel and Proceed to Map</Button>
          </Flex>
          <Text>{shareMapMessage ?? ''}</Text>
        </Box>
      </Dialog.Content>
    </Dialog.Root>
  );
};
