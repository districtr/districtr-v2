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

import {styled} from '@stitches/react';
import {sharePlan} from '@/app/utils/api/mutations';

const DialogContentContainer = styled(Dialog.Content);

const BoxContainer = styled(Box, {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
});

export const ShareMapsModal: React.FC<{
  open?: boolean;
  onClose?: () => void;
  showTrigger?: boolean;
}> = ({open, onClose, showTrigger}) => {
  const mapDocument = useMapStore(store => store.mapDocument);
  const gerryDBTable = mapDocument?.gerrydb_table;
  const [dialogOpen, setDialogOpen] = React.useState(open || false);

  useEffect(() => {
    setDialogOpen(open || false);
  }, [open]);

  const [copied, setCopied] = React.useState(false);
  const [sharetype, setSharetype] = React.useState('view');
  const [linkCopied, setLinkCopied] = React.useState(false);
  const [password, setPassword] = React.useState<string | null>(null);

  const handleCreateShareLink = async () => {
    const payload = {
      document_id: mapDocument?.document_id,
      password: password ?? null,
      access_type: sharetype,
    };

    try {
      // get the share link
      sharePlan.mutate(payload).then(token => {
        // copy to clipboard
        const shareableLink = `${window.location.origin}?share=${token.token}`;
        navigator.clipboard.writeText(shareableLink);

        // Set link copied state
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      });
    } catch (error) {
      console.error('Error creating share link: ', error);
    }
  };

  const handleShareTypeChange = (value: string) => {
    // handle share type change
    setSharetype(value);
  };

  const handlePasswordEntry = (pw: string) => {
    if (pw !== undefined && pw !== null) {
      if (pw.length > 0) {
        setPassword(pw);
        return;
      } else {
        setPassword(null);
      }
    }
  };

  useEffect(() => {
    if (!dialogOpen) {
      onClose?.();
    }
  }, [dialogOpen]);

  // if no gerrydb table selected return null
  if (!gerryDBTable) {
    return <div></div>;
  }

  return (
    <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContentContainer className="max-w-[75vw]">
        <Flex align="center" className="mb-4">
          <Dialog.Title className="m-0 text-xl font-bold flex-1">Share</Dialog.Title>
          <Dialog.Close
            className="rounded-full size-[24px] hover:bg-red-100 p-1"
            aria-label="Close"
          >
            <Cross2Icon />
          </Dialog.Close>
        </Flex>
        <BoxContainer>
          {/* share logic */}
          {mapDocument?.genesis !== 'shared' ? (
            <>
              <Text size="2">
                You can share your plan with others! Share as <b>View Only</b> to let others see and
                copy your plan. <b>Share and make editable</b> to allow others to directly edit your
                plan. You can optionally <b>set a password</b> to restrict who can interact with it.
              </Text>
              <TextField.Root
                variant="soft"
                placeholder={'(Optional) Set a password'}
                size="2"
                value={password ?? undefined}
                onChange={e => handlePasswordEntry(e.target.value)}
                className="items-center"
              ></TextField.Root>
              <Flex gap="2" className="flex-col">
                <RadioCards.Root onValueChange={handleShareTypeChange} value={sharetype}>
                  <RadioCards.Item value="view">Share View Only</RadioCards.Item>
                  <RadioCards.Item value="edit" disabled>
                    Share and make editable
                  </RadioCards.Item>
                </RadioCards.Root>
                <Button
                  variant="soft"
                  className="flex items-center"
                  onClick={handleCreateShareLink}
                  disabled={linkCopied ?? false}
                >
                  {linkCopied ? 'Copied!' : 'Click to copy link'}
                </Button>
              </Flex>
            </>
          ) : (
            <Button
              variant="soft"
              className="flex items-center"
              onClick={handleCreateShareLink}
              disabled={linkCopied ?? false}
            >
              {linkCopied ? 'Copied!' : 'Click to copy link'}
            </Button>
          )}

          {/* close dialog */}
          <Box className="border-t border-gray-200"></Box>
          <Button
            variant="soft"
            className="flex items-center"
            onClick={() => {
              setDialogOpen(false);
            }}
          >
            Close
          </Button>
        </BoxContainer>
      </DialogContentContainer>
    </Dialog.Root>
  );
};
