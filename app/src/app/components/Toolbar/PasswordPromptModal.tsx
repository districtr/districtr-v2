import {useMapStore} from '@/app/store/mapStore';
import React, {useEffect} from 'react';
import {Cross2Icon} from '@radix-ui/react-icons';
import {Button, Flex, Text, Dialog, Box, TextField} from '@radix-ui/themes';
import { useRouter, useSearchParams } from 'next/navigation';
import { getLoadPlanFromPublicId } from '@/app/utils/api/apiHandlers/getLoadPlanFromPublicId';

export const PasswordPromptModal = () => {
  const router = useRouter();
  const pwRequired = useSearchParams().get('pw');
  const [dialogOpen, setDialogOpen] = React.useState(Boolean(pwRequired));
  const [password, setPassword] = React.useState<string | null>(null);
  const shareMapMessage = useMapStore(store => store.shareMapMessage);
  const mapDocument = useMapStore(store => store.mapDocument);

  useEffect(() => {
    setDialogOpen(Boolean(pwRequired));
  }, [pwRequired]);

  const handleProceed = async (editAccess: boolean) => {
    if (!editAccess) {
      // remove pw from url
      router.replace(window.location.pathname);
    } else if (mapDocument?.public_id) {
      const res = await getLoadPlanFromPublicId({
        public_id: mapDocument?.public_id,
        password: password,
      });
      if (res.document_id && res.document_id !== mapDocument?.document_id) {
        // go to map/edit/res.document_id
        router.replace(`/map/edit/${res.document_id}`);
      }
    }
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
