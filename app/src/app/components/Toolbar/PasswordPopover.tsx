import {useState} from 'react';
import {TextField, IconButton, Flex, Box} from '@radix-ui/themes';
import {LockOpen2Icon} from '@radix-ui/react-icons';
import {useMapStore} from '@/app/store/mapStore';
export const PasswordPopover = () => {
  const [password, setPassword] = useState('');
  const handleUnlockWithPassword = useMapStore(state => state.handleUnlockWithPassword);
  return (
    <Flex direction="row" gap="2" align="center">
      <TextField.Root
        size="1"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Enter Password"
      ></TextField.Root>
      <IconButton
        variant="ghost"
        onClick={() => handleUnlockWithPassword(password)}
        disabled={!password.length}
      >
        <LockOpen2Icon />
      </IconButton>
    </Flex>
  );
};
