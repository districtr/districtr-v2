import {useState} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {Cross1Icon, InfoCircledIcon} from '@radix-ui/react-icons';
import {Box, Flex, IconButton, Text} from '@radix-ui/themes';

export const MapContextComment = () => {
  const [dismissed, setDismissed] = useState(false);
  const comment = useMapStore(state => state.mapDocument?.comment);

  if (dismissed || !comment?.length) {
    return null;
  }

  return (
    <>
      {!!comment && (
        <Flex align="center" gap="2" width="100%" className="p-2 bg-blue-100 rounded-lg">
          <InfoCircledIcon className="size-6 flex-none" />
          <Box width="100%" className="flex-1">
            <Text size="4">{comment}</Text>
          </Box>
          <IconButton variant="ghost" size="1" onClick={() => setDismissed(true)}>
            <Cross1Icon className="size-4 flex-none" />
          </IconButton>
        </Flex>
      )}
    </>
  );
};
