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
  const [password, setPassword] = React.useState('');
  const shareMapMessage = useMapStore(store => store.shareMapMessage);
  useEffect(() => {
    setDialogOpen(passwordRequired);
  }, [passwordRequired]);

  const handlePasswordSubmit = () => {
    sharedDocument.mutate({
      token: useMapStore.getState().receivedShareToken ?? '',
      password: password,
    });
  };

  const handlePasswordEntry = (pw: string) => {
    // handle password entry
    setPassword(pw);
  };
  return (
    <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
      <Dialog.Content>
        <Box p="3">
          <Text size="2" weight="bold">
            This plan is password protected.{' '}
          </Text>
          <Text size="3" gap="2">
            Please enter a valid password to access this plan
          </Text>

          <TextField.Root
            placeholder="Password"
            size="3"
            value={password}
            onChange={e => handlePasswordEntry(e.target.value)}
          ></TextField.Root>
          <Flex gap="2" py="2">
            <Button p="2" onClick={handlePasswordSubmit}>
              Submit
            </Button>
          </Flex>
          <Text>{shareMapMessage ?? ''}</Text>
        </Box>
      </Dialog.Content>
    </Dialog.Root>
  );
};
