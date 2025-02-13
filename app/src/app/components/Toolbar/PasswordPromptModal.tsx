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
import {set} from 'lodash';

export const PasswordPromptModal = () => {
  const passwordRequired = useMapStore(store => store.passwordPrompt);
  const [dialogOpen, setDialogOpen] = React.useState(passwordRequired);
  const [password, setPassword] = React.useState('');

  useEffect(() => {
    setDialogOpen(passwordRequired);
  }, [passwordRequired]);

  const handlePasswordSubmit = () => {
    // submit password via mutation

    alert('Password submitted');
  };

  const handlePasswordEntry = pw => {
    // handle password entry
    setPassword(pw);
  };
  return (
    <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
      <Dialog.Content>
        <Box css={{padding: '$3'}}>
          <Text css={{fontSize: '$2', fontWeight: 'bold'}}>This plan is password protected. </Text>
          <Text css={{fontSize: '$1', color: '$gray600', gap: '$1'}}>
            Please enter a valid password to access this plan
          </Text>

          <TextField.Root
            placeholder="Password"
            size="3"
            value={password}
            onChange={e => handlePasswordEntry(e.target.value)}
          ></TextField.Root>
          <Flex css={{gap: '$1'}}>
            <Button onClick={handlePasswordSubmit}>Submit</Button>
          </Flex>
        </Box>
      </Dialog.Content>
    </Dialog.Root>
  );
};
