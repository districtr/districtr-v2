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
  const {upsertUserMap} = useMapStore(store => store);
  const userMaps = useMapStore(store => store.userMaps);
  const currentMap = React.useMemo(
    () => userMaps.find(map => map.document_id === mapDocument?.document_id),
    [mapDocument?.document_id, userMaps]
  );
  const [sharetype, setSharetype] = React.useState('view');
  const [linkCopied, setLinkCopied] = React.useState(false);
  const [password, setPassword] = React.useState<string | null>(currentMap?.password ?? null);
  const [passwordDisabled, setPasswordDisabled] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(true);

  useEffect(() => {
    setDialogOpen(open || false);
  }, [open]);

  useEffect(() => {
    if (currentMap && currentMap.password) {
      setPassword(currentMap.password);
      setPasswordDisabled(true);
      setIsVisible(false);
    }
  }, [currentMap]);

  const handleCreateShareLink = async () => {
    const payload = {
      document_id: mapDocument?.document_id,
      password: password ?? null,
      access_type: sharetype,
    };

    try {
      // get the share link
      const token = await sharePlan.mutate(payload);
      // copy to clipboard
      if (token !== undefined) {
        const shareableLink = `${window.location.origin}?share=${token.token}`;
        navigator.clipboard.writeText(shareableLink);

        if (password !== null && mapDocument?.document_id) {
          upsertUserMap({
            documentId: mapDocument?.document_id,
            mapDocument: {
              ...mapDocument,
              password: password,
            },
          });
          setIsVisible(false);
        }
        setPasswordDisabled(true);
        // Set link copied state
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      }
    } catch (error) {
      console.error('Error creating share link: ', error);
      useMapStore
        .getState()
        .setErrorNotification({message: 'Error creating share link', severity: 2});
    }
  };

  const handleShareTypeChange = (value: string) => {
    // handle share type change
    setSharetype(value);
  };

  const handleSetPassword = () => {
    // lock password field
    setPasswordDisabled(true);
    setIsVisible(false);

    if (password !== null && mapDocument?.document_id) {
      upsertUserMap({
        documentId: mapDocument?.document_id,
        mapDocument: {
          ...mapDocument,
          password: password,
        },
      });
    }
  };

  const handlePasswordEntry = (pw: string) => {
    if (pw) {
      setPassword(pw);
      return;
    } else {
      setPassword(null);
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
              <Flex gap="2" className="flex-row items-center ">
                {!password && passwordDisabled ? null : (
                  <TextField.Root
                    disabled={passwordDisabled}
                    type={isVisible ? 'text' : 'password'}
                    variant="soft"
                    placeholder={'(Optional) Set a password'}
                    size="2"
                    // style={{width: '50%'}}
                    value={password ?? undefined}
                    onChange={e => handlePasswordEntry(e.target.value)}
                    className="items-center w-1/2"
                  ></TextField.Root>
                )}
                {password && !passwordDisabled ? (
                  <IconButton
                    variant="soft"
                    className="flex items-center w-1/5"
                    onClick={handleSetPassword}
                  >
                    Save
                  </IconButton>
                ) : (password && passwordDisabled) || !isVisible ? (
                  <IconButton
                    variant="soft"
                    style={{width: '20%'}}
                    className="items-center "
                    onClick={() => setIsVisible(!isVisible)}
                  >
                    {!isVisible ? 'Show' : 'Hide'}
                  </IconButton>
                ) : null}
              </Flex>
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
