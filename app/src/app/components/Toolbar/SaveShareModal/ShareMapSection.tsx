import {useIdbDocument} from '@/app/hooks/useIdbDocument';
import {useMapStore} from '@/app/store/mapStore';
import {useSaveShareStore} from '@/app/store/saveShareStore';
import {EyeClosedIcon, EyeOpenIcon, Pencil1Icon} from '@radix-ui/react-icons';
import {Button, Flex, Heading, Select, Text, TextField} from '@radix-ui/themes';
import {useState} from 'react';

export const ShareMapSection: React.FC<{isEditing: boolean}> = ({isEditing}) => {
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const password = useSaveShareStore(state => state.password);
  const setPassword = useSaveShareStore(state => state.setPassword);
  const sharingMode = useSaveShareStore(state => state.sharingMode);
  const setSharingMode = useSaveShareStore(state => state.setSharingMode);
  const updatePassword = useSaveShareStore(state => state.updatePassword);
  const handleSetPassword = (password: string) => updatePassword(mapDocument, password);
  const mapDocument = useMapStore(state => state.mapDocument);
  const userMap = useIdbDocument(mapDocument?.document_id);

  if (!mapDocument || !isEditing) {
    return null;
  }

  return (
    <Flex direction="column" gap="2">
      <Heading as="h3" size="5">
        Map sharing
      </Heading>
      <Select.Root onValueChange={setSharingMode} value={sharingMode} size="3">
        <Select.Trigger className="h-auto" />
        <Select.Content>
          <Select.Item value="read" className="h-auto">
            <Flex direction="row" gap="2" align="center" className="max-w-full py-2">
              <EyeOpenIcon />
              <Flex direction="column">
                <Text weight="bold">Frozen</Text>
                <Text>Share a read-only copy of the plan. Viewers can make a copy.</Text>
              </Flex>
            </Flex>
          </Select.Item>
          <Select.Item value="edit" className="h-auto">
            <Flex direction="row" gap="2" align="center" className="max-w-full py-2">
              <Pencil1Icon />
              <Flex direction="column">
                <Text weight="bold">Editable</Text>
                <Text>Anyone with the password can take turns updating the plan.</Text>
              </Flex>
            </Flex>
          </Select.Item>
        </Select.Content>
      </Select.Root>
      {sharingMode === 'edit' && (
        <Flex direction="column" gap="2">
          <Text>Password</Text>
          <Flex direction="row" gap="2">
            <TextField.Root
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={!!userMap?.password}
              className="flex-1"
              placeholder={password || 'Enter a password for your map'}
            />
            {userMap?.password ? (
              <Button variant="soft" onClick={() => setShowPassword(p => !p)}>
                {showPassword ? <EyeClosedIcon /> : <EyeOpenIcon />}
              </Button>
            ) : password.length > 0 ? (
              <Button variant="soft" onClick={() => handleSetPassword(password)}>
                Save
              </Button>
            ) : null}
          </Flex>
        </Flex>
      )}
    </Flex>
  );
};
